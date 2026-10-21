"""Screen mocks with a shared hearing thread, and the handoff pack — SPEC §18.

The AI only ever adds a new version or returns a draft; adopting a version and saving the handoff are human actions.
"""

from __future__ import annotations

import io
import re
import uuid
import zipfile

from app.constants.enums import ChatRole, ItemType, MockDocKind, RequestAction, RequestKind
from app.constants.limits import HANDOFF_HISTORY_FOR_AI, MOCK_HISTORY_FOR_AI, MOCK_HTML_MAX, MOCK_SCREENS_MAX
from app.core.clock import today_jst, utc_now_iso
from app.core.errors import NotFound, ValidationFailed
from app.models.common import UserContext
from app.models.mock import (
    Handoff,
    HandoffDraft,
    HandoffDraftRequest,
    HandoffSave,
    Screen,
    ScreenCreate,
    ScreenMessage,
    ScreenPatch,
    ScreenSend,
    ScreenVersion,
    ScreenVersionMeta,
)
from app.services.access import load_project_for, load_project_for_edit
from app.services.context import Repos
from app.services.llm_client import LlmClient
from app.services.mock_prompts import (
    HANDOFF_SCHEMA,
    MOCK_SCHEMA,
    agents_md,
    handoff_system_prompt,
    handoff_user_prompt,
    mock_system_prompt,
    mock_user_prompt,
)
from app.services.mode_service import get_mode

SCREEN_NOT_FOUND = "画面が見つかりません。削除された可能性があります。画面を再読み込みしてください。"
VERSION_NOT_FOUND = "指定した版が見つかりません。画面を再読み込みしてください。"
_UNSAFE_NAME = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_KIND_LABEL = {RequestKind.REQUEST.value: "要望", RequestKind.ISSUE.value: "課題"}
_ACTION_LABEL = {RequestAction.UNDECIDED.value: "未判断", RequestAction.NEEDED.value: "対応要",
                 RequestAction.NOT_NEEDED.value: "対応不要"}


def _screen_out(doc: dict) -> dict:
    return Screen.model_validate(doc).model_dump(mode="json")


def _meta_out(doc: dict) -> dict:
    return ScreenVersionMeta.model_validate(doc).model_dump(mode="json")


def _message_out(doc: dict) -> dict:
    return ScreenMessage.model_validate(doc).model_dump(mode="json")


def _get_screen(repos: Repos, project_id: str, screen_id: str) -> dict:
    doc = repos.mocks.get(project_id, screen_id)
    if not doc or doc.get("kind") != MockDocKind.SCREEN.value:
        raise NotFound(SCREEN_NOT_FOUND)
    return doc


def _get_version(repos: Repos, project_id: str, screen_id: str, version_id: str) -> dict:
    doc = repos.mocks.get(project_id, version_id)
    if not doc or doc.get("kind") != MockDocKind.VERSION.value or doc.get("screen_id") != screen_id:
        raise ValidationFailed(VERSION_NOT_FOUND)
    return doc


def _latest_version(repos: Repos, project_id: str, screen_id: str) -> dict | None:
    versions = repos.mocks.list(project_id, MockDocKind.VERSION, screen_id)
    return max(versions, key=lambda v: v["no"]) if versions else None


def _context(repos: Repos, project: dict) -> dict:
    """What the AI needs to keep the screen on-goal: goal, assumptions, criteria, requests (labels from the mode)."""
    lb = get_mode(repos, project["mode"])["labels"]
    items = repos.items.list(project["id"])

    def of(t: ItemType) -> list[dict]:
        return [i for i in items if i["type"] == t.value]

    return {
        "labels": {"goal": lb["goal"], "assumption": lb["assumption"], "criterion": lb["criterion"]},
        "project": {"title": project["title"], "goal": project["goal"]},
        "assumptions": [a["text"] for a in of(ItemType.ASSUMPTION)],
        "criteria": [c["text"] for c in of(ItemType.CRITERION)],
        "requests": [{"kind": _KIND_LABEL.get(r["kind"], r["kind"]), "title": r["title"],
                      "description": r.get("description", ""), "action": _ACTION_LABEL.get(r["action"], r["action"])}
                     for r in of(ItemType.REQUEST)],
    }


def _history(repos: Repos, project_id: str, screen_id: str, limit: int) -> list[dict]:
    docs = repos.mocks.list(project_id, MockDocKind.MESSAGE, screen_id)[-limit:]
    return [{"role": d["role"], "content": d["content"]} for d in docs]


# ---------------- screens ----------------

def list_screens(repos: Repos, project_id: str, user: UserContext) -> list[dict]:
    load_project_for(repos, project_id, user)
    return [_screen_out(d) for d in repos.mocks.list(project_id, MockDocKind.SCREEN)]


def create_screen(repos: Repos, project_id: str, body: ScreenCreate, user: UserContext) -> dict:
    load_project_for_edit(repos, project_id, user)
    if len(repos.mocks.list(project_id, MockDocKind.SCREEN)) >= MOCK_SCREENS_MAX:
        raise ValidationFailed(f"画面は 1 つの取り組みに {MOCK_SCREENS_MAX} 個までです。使わない画面を削除してから追加してください。")
    name = body.name.strip()
    if not name:
        raise ValidationFailed("画面の名前を入力してください。")
    now = utc_now_iso()
    doc = {"id": str(uuid.uuid4()), "projectId": project_id, "kind": MockDocKind.SCREEN.value, "name": name,
           "description": body.description.strip(), "adopted_version_id": None, "latest_version_no": 0,
           "handoff": None, "created_by": user.email, "created_at": now, "updated_at": now}
    return _screen_out(repos.mocks.save(doc))


def get_screen_detail(repos: Repos, project_id: str, screen_id: str, user: UserContext) -> dict:
    load_project_for(repos, project_id, user)
    screen = _get_screen(repos, project_id, screen_id)
    versions = sorted(repos.mocks.list(project_id, MockDocKind.VERSION, screen_id), key=lambda v: v["no"])
    messages = repos.mocks.list(project_id, MockDocKind.MESSAGE, screen_id)
    return {"screen": _screen_out(screen), "versions": [_meta_out(v) for v in versions],
            "messages": [_message_out(m) for m in messages]}


def update_screen(repos: Repos, project_id: str, screen_id: str, patch: ScreenPatch, user: UserContext) -> dict:
    load_project_for_edit(repos, project_id, user)
    doc = _get_screen(repos, project_id, screen_id)
    fields = patch.model_dump(exclude_unset=True)
    if fields.get("name") is not None:
        name = fields["name"].strip()
        if not name:
            raise ValidationFailed("画面の名前を入力してください。")
        doc["name"] = name
    if fields.get("description") is not None:
        doc["description"] = fields["description"].strip()
    if "adopted_version_id" in fields:
        vid = fields["adopted_version_id"] or None
        if vid:
            _get_version(repos, project_id, screen_id, vid)
        doc["adopted_version_id"] = vid
    doc["updated_at"] = utc_now_iso()
    return _screen_out(repos.mocks.save(doc))


def delete_screen(repos: Repos, project_id: str, screen_id: str, user: UserContext) -> None:
    load_project_for_edit(repos, project_id, user)
    _get_screen(repos, project_id, screen_id)
    for kind in (MockDocKind.VERSION, MockDocKind.MESSAGE):
        for d in repos.mocks.list(project_id, kind, screen_id):
            repos.mocks.delete(project_id, d["id"])
    repos.mocks.delete(project_id, screen_id)


def get_version(repos: Repos, project_id: str, screen_id: str, version_id: str, user: UserContext) -> dict:
    load_project_for(repos, project_id, user)
    _get_screen(repos, project_id, screen_id)
    doc = repos.mocks.get(project_id, version_id)
    if not doc or doc.get("kind") != MockDocKind.VERSION.value or doc.get("screen_id") != screen_id:
        raise NotFound(VERSION_NOT_FOUND)
    return ScreenVersion.model_validate(doc).model_dump(mode="json")


# ---------------- hearing thread ----------------

def send_message(repos: Repos, llm: LlmClient, project_id: str, screen_id: str, body: ScreenSend,
                 user: UserContext) -> dict:
    project = load_project_for_edit(repos, project_id, user)
    screen = _get_screen(repos, project_id, screen_id)
    text = body.message.strip()
    if not text:
        raise ValidationFailed("依頼を入力してください。")
    base = (_get_version(repos, project_id, screen_id, body.base_version_id) if body.base_version_id
            else _latest_version(repos, project_id, screen_id))
    history = _history(repos, project_id, screen_id, MOCK_HISTORY_FOR_AI)

    user_doc = {"id": str(uuid.uuid4()), "projectId": project_id, "kind": MockDocKind.MESSAGE.value,
                "screen_id": screen_id, "role": ChatRole.USER.value, "content": text, "author_name": user.name,
                "version_id": None, "created_by": user.email, "created_at": utc_now_iso()}
    repos.mocks.save(user_doc)

    raw = llm.complete_json(
        system=mock_system_prompt(today_jst()),
        user=mock_user_prompt(_context(repos, project), screen, base["html"] if base else "", history, text),
        schema_name="mock_reply", schema=MOCK_SCHEMA,
    )
    reply = str(raw.get("reply") or "").strip() or "（返答がありませんでした。言い換えてもう一度お試しください）"
    html = str(raw.get("html") or "").strip()
    version: dict | None = None
    if len(html) > MOCK_HTML_MAX:
        reply += (f"\n\n※ 作成した画面が長すぎるため（{MOCK_HTML_MAX} 字超）、版を保存できませんでした。"
                  "画面を分けるか、範囲を絞って依頼してください。")
    elif html:
        screen = _get_screen(repos, project_id, screen_id)  # re-read: another member may have added a version meanwhile
        no = int(screen.get("latest_version_no") or 0) + 1
        version = {"id": str(uuid.uuid4()), "projectId": project_id, "kind": MockDocKind.VERSION.value,
                   "screen_id": screen_id, "no": no, "html": html, "summary": str(raw.get("summary") or "").strip(),
                   "message_id": user_doc["id"], "created_by": user.email, "created_at": utc_now_iso()}
        repos.mocks.save(version)
        screen["latest_version_no"] = no
        screen["updated_at"] = utc_now_iso()
        repos.mocks.save(screen)

    assistant = {"id": str(uuid.uuid4()), "projectId": project_id, "kind": MockDocKind.MESSAGE.value,
                 "screen_id": screen_id, "role": ChatRole.ASSISTANT.value, "content": reply, "author_name": "AI",
                 "version_id": version["id"] if version else None, "created_by": user.email,
                 "created_at": utc_now_iso()}
    repos.mocks.save(assistant)
    return {"user_message": _message_out(user_doc), "assistant_message": _message_out(assistant),
            "version": _meta_out(version) if version else None}


# ---------------- handoff pack ----------------

def _handoff_version(repos: Repos, project_id: str, screen: dict, version_id: str | None) -> dict:
    if version_id:
        return _get_version(repos, project_id, screen["id"], version_id)
    if screen.get("adopted_version_id"):
        return _get_version(repos, project_id, screen["id"], screen["adopted_version_id"])
    latest = _latest_version(repos, project_id, screen["id"])
    if not latest:
        raise ValidationFailed("まだモックの版がありません。会話で画面を作ってから引き渡しパックを作成してください。")
    return latest


def draft_handoff(repos: Repos, llm: LlmClient, project_id: str, screen_id: str, body: HandoffDraftRequest,
                  user: UserContext) -> dict:
    project = load_project_for_edit(repos, project_id, user)
    screen = _get_screen(repos, project_id, screen_id)
    version = _handoff_version(repos, project_id, screen, body.version_id)
    tech_notes = body.tech_notes.strip()
    raw = llm.complete_json(
        system=handoff_system_prompt(),
        user=handoff_user_prompt(_context(repos, project), screen, version["html"],
                                 _history(repos, project_id, screen_id, HANDOFF_HISTORY_FOR_AI), tech_notes),
        schema_name="handoff_draft", schema=HANDOFF_SCHEMA,
    )
    return HandoffDraft(version_id=version["id"], screen_spec=str(raw.get("screen_spec") or "").strip(),
                        acceptance=str(raw.get("acceptance") or "").strip(),
                        agents=agents_md(screen["name"], tech_notes)).model_dump(mode="json")


def save_handoff(repos: Repos, project_id: str, screen_id: str, body: HandoffSave, user: UserContext) -> dict:
    load_project_for_edit(repos, project_id, user)
    screen = _get_screen(repos, project_id, screen_id)
    _get_version(repos, project_id, screen_id, body.version_id)
    now = utc_now_iso()
    screen["handoff"] = Handoff(version_id=body.version_id, tech_notes=body.tech_notes.strip(),
                                screen_spec=body.screen_spec, acceptance=body.acceptance, agents=body.agents,
                                updated_at=now, updated_by=user.email).model_dump(mode="json")
    screen["updated_at"] = now
    return _screen_out(repos.mocks.save(screen))


def folder_name(screen_name: str) -> str:
    return _UNSAFE_NAME.sub("_", screen_name).strip(" .") or "screen"


def export_handoff(repos: Repos, project_id: str, screen_id: str, user: UserContext) -> tuple[str, bytes]:
    """Returns (zip file name, zip bytes) — SPEC §18.4."""
    load_project_for(repos, project_id, user)
    screen = _get_screen(repos, project_id, screen_id)
    handoff = screen.get("handoff")
    if not handoff:
        raise ValidationFailed("引き渡しパックがまだ保存されていません。下書きを作成して保存してから出力してください。")
    version = _get_version(repos, project_id, screen_id, handoff["version_id"])
    folder = folder_name(screen["name"])
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{folder}/mock.html", version["html"])
        z.writestr(f"{folder}/SCREEN_SPEC.md", handoff["screen_spec"])
        z.writestr(f"{folder}/ACCEPTANCE.md", handoff["acceptance"])
        z.writestr(f"{folder}/AGENTS.md", handoff["agents"])
    return f"{folder}.zip", buf.getvalue()
