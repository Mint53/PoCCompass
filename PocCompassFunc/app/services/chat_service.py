"""AI chat — SPEC §11. The AI proposes; a person applies. Applying goes through the normal services."""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from app.constants.enums import (
    ChatRole,
    ItemType,
    OperationKind,
    OperationTarget,
    ProposalStatus,
)
from app.constants.limits import CHAT_HISTORY_FOR_AI, CHAT_LIST_MAX, CHAT_MAX_OPERATIONS, CHAT_MESSAGE_MAX
from app.core.clock import today_jst, utc_now_iso
from app.core.errors import AppError, NotFound, ValidationFailed
from app.models.chat import ChatMessage, Operation, Proposal
from app.models.common import UserContext
from app.models.items import CREATE_MODELS, ItemPatch
from app.models.project import ProjectUpdate
from app.services import item_service, project_service
from app.services.access import load_project_for_edit
from app.services.chat_prompts import CHAT_SCHEMA, chat_system_prompt, chat_user_prompt
from app.services.context import Repos
from app.services.evaluation_service import build_dashboard
from app.services.llm_client import LlmClient
from app.services.mode_service import get_mode
from app.services.prompts import AliasMap

logger = logging.getLogger(__name__)

_PREFIX = {
    OperationTarget.ASSUMPTION: "A",
    OperationTarget.CRITERION: "C",
    OperationTarget.TASK: "T",
    OperationTarget.EVIDENCE: "E",
}
_TARGET_TYPE = {
    OperationTarget.ASSUMPTION: ItemType.ASSUMPTION,
    OperationTarget.CRITERION: ItemType.CRITERION,
    OperationTarget.TASK: ItemType.TASK,
    OperationTarget.EVIDENCE: ItemType.EVIDENCE,
}
_VALUE_LABELS = {
    "untested": "未検証", "testing": "検証中", "supported": "支持された", "rejected": "否定された",
    "not_met": "未達成", "met": "達成", "todo": "未着手", "doing": "進行中", "done": "完了",
    "high": "高", "medium": "中", "low": "低",
    "supports": "支持する", "refutes": "否定する", "inconclusive": "判断できない",
}
_OP_WORD = {OperationKind.CREATE: "追加", OperationKind.UPDATE: "変更", OperationKind.DELETE: "削除"}
_ALIAS_IN_TEXT = re.compile(r"(?<![A-Za-z0-9])([ACTE])(\d{1,3})(?![0-9])")


class _Ctx:
    """Project snapshot + alias maps used to build the prompt and to resolve the AI's references."""

    def __init__(self, repos: Repos, project: dict):
        self.project = project
        self.mode = get_mode(repos, project["mode"])
        items = repos.items.list(project["id"])
        self.by_type = {t: [i for i in items if i["type"] == t.value] for t in ItemType}
        self.maps = {
            target: AliasMap(prefix, [i["id"] for i in self.by_type[_TARGET_TYPE[target]]])
            for target, prefix in _PREFIX.items()
        }
        self.items_by_id = {i["id"]: i for i in items}
        self.repos = repos

    def alias(self, target: OperationTarget, real_id: str) -> str:
        return self.maps[target].to_alias.get(real_id, "")

    def resolve(self, target: OperationTarget, ref: str) -> str | None:
        ids = self.maps[target].resolve([ref.strip()])
        return ids[0] if ids else None

    def label(self, target: OperationTarget) -> str:
        lb = self.mode["labels"]
        return {"assumption": lb["assumption"], "criterion": lb["criterion"], "task": lb["task"],
                "evidence": lb["evidence"], "project": "取り組み"}[target.value]

    def item_name(self, item: dict) -> str:
        return item.get("title") or item.get("text") or item.get("summary") or ""

    def humanize(self, text: str) -> str:
        targets = {"A": OperationTarget.ASSUMPTION, "C": OperationTarget.CRITERION, "T": OperationTarget.TASK,
                   "E": OperationTarget.EVIDENCE}
        return _ALIAS_IN_TEXT.sub(lambda m: f"{self.label(targets[m.group(1)])}{m.group(2)}", text)

    def prompt_context(self, dashboard: dict, evaluation: dict | None) -> dict:
        results = {r["task_id"]: r for r in (evaluation or {}).get("task_results", [])}
        ev_count: dict[str, int] = {}
        for e in self.by_type[ItemType.EVIDENCE]:
            ev_count[e["assumption_id"]] = ev_count.get(e["assumption_id"], 0) + 1
        a, c, t = OperationTarget.ASSUMPTION, OperationTarget.CRITERION, OperationTarget.TASK
        return {
            "labels": self.mode["labels"],
            "project": {"title": self.project["title"], "goal": self.project["goal"],
                        "start_date": self.project["start_date"], "deadline": self.project["deadline"],
                        "status": self.project["status"]},
            "assumptions": [{"ref": self.alias(a, x["id"]), "text": x["text"], "status": x["status"],
                             "priority": x["priority"], "evidence_count": ev_count.get(x["id"], 0)}
                            for x in self.by_type[ItemType.ASSUMPTION]],
            "criteria": [{"ref": self.alias(c, x["id"]), "text": x["text"], "target_value": x.get("target", ""),
                          "status": x["status"]} for x in self.by_type[ItemType.CRITERION]],
            "tasks": [{"ref": self.alias(t, x["id"]), "title": x["title"], "description": x.get("description", ""),
                       "status": x["status"], "effort_hours": x.get("effort_hours"),
                       "start_date": x.get("start_date"), "due_date": x.get("due_date"),
                       "linked_assumption_refs": [self.alias(a, i) for i in x.get("linked_assumption_ids", [])],
                       "linked_criterion_refs": [self.alias(c, i) for i in x.get("linked_criterion_ids", [])],
                       "ai_verdict": (results.get(x["id"]) or {}).get("verdict"),
                       "ai_alignment_score": (results.get(x["id"]) or {}).get("alignment_score"),
                       "ai_reason": (results.get(x["id"]) or {}).get("reason")}
                      for x in self.by_type[ItemType.TASK]],
            "evidence": [{"ref": self.alias(OperationTarget.EVIDENCE, x["id"]),
                          "assumption_ref": self.alias(a, x["assumption_id"]), "summary": x["summary"],
                          "result": x["result"], "source": x.get("source", "")}
                         for x in self.by_type[ItemType.EVIDENCE]],
            "metrics": {"health_score": dashboard["health"]["score"], "components": dashboard["health"]["components"],
                        "cards": dashboard["cards"], "schedule": dashboard["schedule"],
                        "last_evaluated_at": dashboard["last_evaluated_at"]},
        }


# ---------------- proposal building ----------------

def _non_null(fields: dict) -> dict:
    return {k: v for k, v in (fields or {}).items() if v is not None}


def _map_fields(ctx: _Ctx, target: OperationTarget, raw: dict) -> dict:
    """AI field names -> stored field names, resolving A/C refs to ids. Unknown refs raise ValidationFailed."""
    f = _non_null(raw)
    out: dict[str, Any] = {}
    for key, value in f.items():
        if key == "target_value":
            out["target"] = value
        elif key == "linked_assumption_refs":
            out["linked_assumption_ids"] = _resolve_all(ctx, OperationTarget.ASSUMPTION, value)
        elif key == "linked_criterion_refs":
            out["linked_criterion_ids"] = _resolve_all(ctx, OperationTarget.CRITERION, value)
        elif key == "assumption_ref":
            real = ctx.resolve(OperationTarget.ASSUMPTION, value)
            if not real:
                raise ValidationFailed(f"{ctx.label(OperationTarget.ASSUMPTION)}「{value}」が見つかりません。")
            out["assumption_id"] = real
        else:
            out[key] = value
    return out


def _resolve_all(ctx: _Ctx, target: OperationTarget, refs: list[str]) -> list[str]:
    ids = []
    for r in refs:
        real = ctx.resolve(target, r)
        if not real:
            raise ValidationFailed(f"{ctx.label(target)}「{r}」が見つかりません。")
        ids.append(real)
    return ids


def _describe_value(ctx: _Ctx, key: str, value: Any) -> str:
    if key in ("linked_assumption_ids", "linked_criterion_ids"):
        names = [ctx.item_name(ctx.items_by_id[i]) for i in value if i in ctx.items_by_id]
        return "、".join(f"「{n}」" for n in names) or "なし"
    if key == "assumption_id":
        return f"「{ctx.item_name(ctx.items_by_id.get(value, {}))}」"
    if isinstance(value, str):
        return _VALUE_LABELS.get(value, value)
    return str(value)


def _field_label(ctx: _Ctx, key: str) -> str:
    lb = ctx.mode["labels"]
    return {
        "title": "タイトル", "description": "内容", "text": "本文", "status": "状態", "priority": "優先度",
        "target": "目標値", "effort_hours": "工数（時間）", "due_date": "期日",
        "linked_assumption_ids": f"関係する{lb['assumption']}", "linked_criterion_ids": f"関係する{lb['criterion']}",
        "assumption_id": f"対象の{lb['assumption']}", "summary": "内容", "result": "結果", "source": "出典",
        "goal": lb["goal"], "start_date": "開始日", "deadline": lb["deadline"],
    }.get(key, key)


def _changes_text(ctx: _Ctx, changes: dict) -> str:
    return "／".join(f"{_field_label(ctx, k)} → {_describe_value(ctx, k, v)}" for k, v in changes.items())


def _build_operation(ctx: _Ctx, raw: dict) -> Operation:
    """Resolve and validate one AI operation. Never raises: problems are returned in `error`."""
    try:
        op = OperationKind(raw.get("op"))
        target = OperationTarget(raw.get("target"))
    except ValueError:
        return Operation(op=OperationKind.UPDATE, target=OperationTarget.PROJECT, summary="（解釈できない操作）",
                         error="AI が対応していない操作を返しました。")
    label = ctx.label(target)
    pid = ctx.project["id"]
    try:
        if target == OperationTarget.PROJECT:
            if op != OperationKind.UPDATE:
                raise ValidationFailed("取り組み自体の作成・削除はチャットからは行えません。")
            fields = {k: v for k, v in _non_null(raw.get("fields")).items() if k in ("title", "goal", "start_date", "deadline")}
            if not fields:
                raise ValidationFailed("変更内容がありません。")
            body = ProjectUpdate(**fields).model_dump(mode="json", exclude_unset=True)
            merged = {**ctx.project, **body}
            if merged["deadline"] < merged["start_date"]:
                raise ValidationFailed("期限は開始日以降の日付にしてください。")
            return Operation(op=op, target=target, fields=body, summary=f"取り組みを変更: {_changes_text(ctx, body)}")

        item_type = _TARGET_TYPE[target]
        if op == OperationKind.CREATE:
            fields = _map_fields(ctx, target, raw.get("fields"))
            model_fields = set(CREATE_MODELS[item_type.value].model_fields)
            fields = {k: v for k, v in fields.items() if k in model_fields}
            normalized = item_service.prepare_create(ctx.repos, pid, {**fields, "type": item_type.value})
            name = ctx.item_name(normalized)
            extra = {k: v for k, v in fields.items() if k not in ("title", "text", "summary") and v not in ("", [], None)}
            summary = f"{label}を追加: 「{name}」" + (f"（{_changes_text(ctx, extra)}）" if extra else "")
            return Operation(op=op, target=target, fields=normalized, summary=summary)

        item_id = ctx.resolve(target, raw.get("ref", ""))
        if not item_id:
            raise ValidationFailed(f"対象の{label}「{raw.get('ref', '')}」が見つかりません。")
        current = ctx.items_by_id[item_id]
        name = ctx.item_name(current)
        if op == OperationKind.DELETE:
            note = ""
            if target == OperationTarget.ASSUMPTION:
                note = f"（この{label}の{ctx.label(OperationTarget.EVIDENCE)}も削除されます）"
            return Operation(op=op, target=target, item_id=item_id, summary=f"{label}を削除: 「{name}」{note}")

        changes = _map_fields(ctx, target, raw.get("fields"))
        if not changes:
            raise ValidationFailed("変更内容がありません。")
        patch = ItemPatch(**changes)
        item_service.prepare_update(ctx.repos, pid, item_id, patch)  # dry run
        return Operation(op=op, target=target, item_id=item_id, fields=patch.model_dump(mode="json", exclude_unset=True),
                         summary=f"{label}「{name}」を変更: {_changes_text(ctx, changes)}")
    except AppError as e:
        return Operation(op=op, target=target, summary=f"{label}の{_OP_WORD[op]}",
                         error=e.message)
    except Exception as e:  # noqa: BLE001 - pydantic etc.; must not break the chat
        logger.warning("chat operation rejected: %r", e)
        return Operation(op=op, target=target, summary=f"{label}の操作", error="入力内容が正しくありません。")


# ---------------- public API ----------------

def list_messages(repos: Repos, project_id: str, user: UserContext) -> list[dict]:
    load_project_for_edit(repos, project_id, user)
    docs = repos.chat.list_for_user(project_id, user.email)[-CHAT_LIST_MAX:]
    return [ChatMessage.model_validate(d).model_dump(mode="json") for d in docs]


def _history_line(doc: dict) -> dict:
    content = doc["content"]
    proposal = doc.get("proposal")
    if proposal:
        ops = "; ".join(o["summary"] for o in proposal["operations"])
        content += f"\n（提案 {len(proposal['operations'])} 件: {ops} → 状態: {proposal['status']}）"
    return {"role": doc["role"], "content": content}


def send_message(repos: Repos, llm: LlmClient, project_id: str, text: str, user: UserContext) -> dict:
    project = load_project_for_edit(repos, project_id, user)
    text = text.strip()
    if not text:
        raise ValidationFailed("メッセージを入力してください。")
    if len(text) > CHAT_MESSAGE_MAX:
        raise ValidationFailed(f"メッセージは {CHAT_MESSAGE_MAX} 字以内にしてください（現在 {len(text)} 字）。")

    history = repos.chat.list_for_user(project_id, user.email)[-CHAT_HISTORY_FOR_AI:]
    user_doc = ChatMessage(id=str(uuid.uuid4()), projectId=project_id, user_email=user.email, role=ChatRole.USER,
                           content=text, created_at=utc_now_iso()).model_dump(mode="json")
    repos.chat.save(user_doc)

    ctx = _Ctx(repos, project)
    dashboard = build_dashboard(repos, project).model_dump(mode="json")
    context = ctx.prompt_context(dashboard, repos.evaluations.latest(project_id))
    raw = llm.complete_json(
        system=chat_system_prompt(ctx.mode, today_jst()),
        user=chat_user_prompt(context, [_history_line(h) for h in history], text),
        schema_name="chat_reply", schema=CHAT_SCHEMA,
    )
    operations = [_build_operation(ctx, r) for r in (raw.get("operations") or [])[:CHAT_MAX_OPERATIONS]]
    reply = ctx.humanize(str(raw.get("reply") or "").strip()) or "（返答がありませんでした。言い換えてもう一度お試しください）"
    assistant = ChatMessage(
        id=str(uuid.uuid4()), projectId=project_id, user_email=user.email, role=ChatRole.ASSISTANT, content=reply,
        created_at=utc_now_iso(),
        proposal=Proposal(status=ProposalStatus.PENDING, operations=operations) if operations else None,
    ).model_dump(mode="json")
    repos.chat.save(assistant)
    return {"user_message": user_doc, "assistant_message": assistant}


def _own_message(repos: Repos, project_id: str, message_id: str, user: UserContext) -> dict:
    doc = repos.chat.get(project_id, message_id)
    if not doc or doc["user_email"] != user.email:
        raise NotFound("メッセージが見つかりません。画面を再読み込みしてください。")
    if not doc.get("proposal"):
        raise ValidationFailed("このメッセージには提案がありません。")
    if doc["proposal"]["status"] != ProposalStatus.PENDING.value:
        raise ValidationFailed("この提案はすでに処理済みです。")
    return doc


def _execute(repos: Repos, project_id: str, op: dict, user: UserContext) -> None:
    target = OperationTarget(op["target"])
    kind = OperationKind(op["op"])
    if target == OperationTarget.PROJECT:
        project_service.update_project(repos, project_id, ProjectUpdate(**op["fields"]), user)
    elif kind == OperationKind.CREATE:
        model = CREATE_MODELS[_TARGET_TYPE[target].value]
        item_service.create_item(repos, project_id, model.model_validate(op["fields"]), user)
    elif kind == OperationKind.UPDATE:
        item_service.update_item(repos, project_id, op["item_id"], ItemPatch(**op["fields"]), user)
    else:
        item_service.delete_item(repos, project_id, op["item_id"], user)


def apply_proposal(repos: Repos, project_id: str, message_id: str, indexes: list[int] | None,
                   user: UserContext) -> dict:
    load_project_for_edit(repos, project_id, user)
    doc = _own_message(repos, project_id, message_id, user)
    ops = doc["proposal"]["operations"]
    selected = set(range(len(ops))) if indexes is None else {i for i in indexes if 0 <= i < len(ops)}
    if not selected:
        raise ValidationFailed("適用する操作を選んでください。")
    for i, op in enumerate(ops):
        if i not in selected or op.get("error"):
            continue
        try:
            _execute(repos, project_id, op, user)
            op["result"], op["result_message"] = "ok", None
        except AppError as e:
            op["result"], op["result_message"] = "failed", e.message
        except Exception as e:  # noqa: BLE001
            logger.exception("chat apply failed: %r", e)
            op["result"], op["result_message"] = "failed", "適用中にエラーが発生しました。"
    valid = [op for op in ops if not op.get("error")]
    all_ok = valid and all(op.get("result") == "ok" for op in valid)
    doc["proposal"]["status"] = (ProposalStatus.APPLIED if all_ok else ProposalStatus.PARTIALLY_APPLIED).value
    repos.chat.save(doc)
    return ChatMessage.model_validate(doc).model_dump(mode="json")


def discard_proposal(repos: Repos, project_id: str, message_id: str, user: UserContext) -> dict:
    load_project_for_edit(repos, project_id, user)
    doc = _own_message(repos, project_id, message_id, user)
    doc["proposal"]["status"] = ProposalStatus.DISCARDED.value
    repos.chat.save(doc)
    return ChatMessage.model_validate(doc).model_dump(mode="json")


def clear_thread(repos: Repos, project_id: str, user: UserContext) -> None:
    load_project_for_edit(repos, project_id, user)
    for d in repos.chat.list_for_user(project_id, user.email):
        repos.chat.delete(project_id, d["id"])
