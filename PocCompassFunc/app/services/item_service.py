"""Project items CRUD (SPEC §3.2) including cascade rules, feedback and decisions."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, TypeAdapter, ValidationError

from app.constants.enums import Decision, ItemType, ProjectStatus
from app.core.clock import utc_now_iso
from app.core.errors import NotFound, ValidationFailed
from app.core.hashing import task_content_hash
from app.models.common import UserContext
from app.models.items import (
    CREATE_MODELS,
    BulkTaskCreate,
    FeedbackCreate,
    Item,
    ItemPatch,
    ProjectItems,
)
from app.services.access import load_project_for, load_project_for_edit
from app.services.context import Repos

_ITEM_ADAPTER: TypeAdapter = TypeAdapter(Item)
_USER_CREATABLE = {ItemType.ASSUMPTION, ItemType.CRITERION, ItemType.TASK, ItemType.EVIDENCE, ItemType.DECISION}
_META_KEYS = ("id", "projectId", "type", "created_at", "updated_at", "created_by")


def _to_response(doc: dict) -> dict:
    return _ITEM_ADAPTER.validate_python(doc).model_dump(mode="json")


def list_items(repos: Repos, project_id: str, user: UserContext) -> dict:
    load_project_for(repos, project_id, user)
    docs = [_to_response(d) for d in repos.items.list(project_id)]

    def of(t: ItemType) -> list[dict]:
        return [d for d in docs if d["type"] == t.value]

    return ProjectItems(
        assumptions=of(ItemType.ASSUMPTION), criteria=of(ItemType.CRITERION), tasks=of(ItemType.TASK),
        evidence=of(ItemType.EVIDENCE), decisions=of(ItemType.DECISION), feedback=of(ItemType.FEEDBACK),
    ).model_dump(mode="json")


def _validate_refs(repos: Repos, project_id: str, fields: dict) -> dict:
    """Drop/verify references to assumptions & criteria of this project."""
    if fields.get("type") == ItemType.TASK.value:
        a_ids = {d["id"] for d in repos.items.list(project_id, ItemType.ASSUMPTION)}
        c_ids = {d["id"] for d in repos.items.list(project_id, ItemType.CRITERION)}
        bad = [i for i in fields.get("linked_assumption_ids", []) if i not in a_ids] + \
              [i for i in fields.get("linked_criterion_ids", []) if i not in c_ids]
        if bad:
            raise ValidationFailed("ひも付け先が見つかりません。画面を再読み込みしてから選び直してください。")
    if fields.get("type") == ItemType.EVIDENCE.value:
        a = repos.items.get(project_id, fields["assumption_id"])
        if not a or a.get("type") != ItemType.ASSUMPTION.value:
            raise ValidationFailed("対象の仮説が見つかりません。画面を再読み込みしてください。")
    return fields


def _save_new(repos: Repos, project_id: str, fields: dict, user: UserContext) -> dict:
    now = utc_now_iso()
    doc = {**fields, "id": str(uuid.uuid4()), "projectId": project_id, "created_at": now, "updated_at": now,
           "created_by": user.email}
    return _to_response(repos.items.save(doc))


def create_item(repos: Repos, project_id: str, body: BaseModel, user: UserContext) -> dict:
    project = load_project_for_edit(repos, project_id, user)
    fields = body.model_dump(mode="json")
    if ItemType(fields["type"]) not in _USER_CREATABLE:
        raise ValidationFailed("この種類の項目はこの方法では作成できません。")
    _validate_refs(repos, project_id, fields)
    saved = _save_new(repos, project_id, fields, user)
    if fields["type"] == ItemType.DECISION.value:
        project["status"] = ProjectStatus.STOPPED.value if fields["decision"] == Decision.STOP.value \
            else ProjectStatus.ACTIVE.value
    project["updated_at"] = utc_now_iso()
    repos.projects.save(project)
    return saved


def bulk_create_tasks(repos: Repos, project_id: str, body: BulkTaskCreate, user: UserContext) -> list[dict]:
    load_project_for_edit(repos, project_id, user)
    # validate all first so a bad row does not leave a half-imported batch
    validated = [_validate_refs(repos, project_id, t.model_dump(mode="json")) for t in body.tasks]
    return [_save_new(repos, project_id, fields, user) for fields in validated]


def prepare_update(repos: Repos, project_id: str, item_id: str, patch: ItemPatch) -> dict:
    """Validate a patch against the stored item and return the new document (not saved). Used by chat proposals too."""
    doc = repos.items.get(project_id, item_id)
    if not doc or doc["type"] in (ItemType.FEEDBACK.value,):
        raise NotFound("項目が見つかりません。画面を再読み込みしてください。")
    changes = patch.model_dump(mode="json", exclude_unset=True, exclude={"clear_effort_hours", "clear_due_date", "clear_start_date"})
    changes = {k: v for k, v in changes.items() if v is not None}
    model = CREATE_MODELS[doc["type"]]
    allowed = set(model.model_fields) - {"type"}
    unknown = set(changes) - allowed
    if unknown:
        raise ValidationFailed(f"この項目では変更できない値が含まれています: {', '.join(sorted(unknown))}")
    merged = {k: v for k, v in doc.items() if k in model.model_fields}
    merged.update(changes)
    if patch.clear_effort_hours and "effort_hours" in allowed:
        merged["effort_hours"] = None
    if patch.clear_due_date and "due_date" in allowed:
        merged["due_date"] = None
    if patch.clear_start_date and "start_date" in allowed:
        merged["start_date"] = None
    try:
        fields = model.model_validate(merged).model_dump(mode="json")
    except ValidationError as e:
        raise ValidationFailed("入力内容が正しくありません: " + "; ".join(err["msg"] for err in e.errors())) from e
    _validate_refs(repos, project_id, fields)
    return {**{k: doc[k] for k in _META_KEYS}, **fields, "updated_at": utc_now_iso()}


def prepare_create(repos: Repos, project_id: str, fields: dict) -> dict:
    """Validate a create payload (type + fields) and return normalized fields (not saved)."""
    item_type = fields.get("type")
    if item_type not in {t.value for t in _USER_CREATABLE}:
        raise ValidationFailed("この種類の項目はこの方法では作成できません。")
    try:
        normalized = CREATE_MODELS[item_type].model_validate(fields).model_dump(mode="json")
    except ValidationError as e:
        raise ValidationFailed("入力内容が正しくありません: " + "; ".join(err["msg"] for err in e.errors())) from e
    return _validate_refs(repos, project_id, normalized)


def update_item(repos: Repos, project_id: str, item_id: str, patch: ItemPatch, user: UserContext) -> dict:
    load_project_for_edit(repos, project_id, user)
    return _to_response(repos.items.save(prepare_update(repos, project_id, item_id, patch)))


def delete_item(repos: Repos, project_id: str, item_id: str, user: UserContext) -> None:
    load_project_for_edit(repos, project_id, user)
    doc = repos.items.get(project_id, item_id)
    if not doc:
        raise NotFound("項目が見つかりません。画面を再読み込みしてください。")
    repos.items.delete(project_id, item_id)
    # cascade (SPEC §3.2)
    if doc["type"] == ItemType.ASSUMPTION.value:
        for e in repos.items.list(project_id, ItemType.EVIDENCE):
            if e["assumption_id"] == item_id:
                repos.items.delete(project_id, e["id"])
        _unlink_tasks(repos, project_id, "linked_assumption_ids", item_id)
    elif doc["type"] == ItemType.CRITERION.value:
        _unlink_tasks(repos, project_id, "linked_criterion_ids", item_id)
    elif doc["type"] == ItemType.TASK.value:
        for f in repos.items.list(project_id, ItemType.FEEDBACK):
            if f["task_id"] == item_id:
                repos.items.delete(project_id, f["id"])


def _unlink_tasks(repos: Repos, project_id: str, field: str, removed_id: str) -> None:
    for t in repos.items.list(project_id, ItemType.TASK):
        if removed_id in t.get(field, []):
            t[field] = [i for i in t[field] if i != removed_id]
            t["updated_at"] = utc_now_iso()
            repos.items.save(t)


def add_feedback(repos: Repos, project_id: str, body: FeedbackCreate, user: UserContext) -> dict:
    load_project_for_edit(repos, project_id, user)
    task = repos.items.get(project_id, body.task_id)
    if not task or task["type"] != ItemType.TASK.value:
        raise NotFound("対象のタスクが見つかりません。画面を再読み込みしてください。")
    fields = {"type": ItemType.FEEDBACK.value, "task_id": body.task_id, "content_hash": task_content_hash(task),
              "judgement": body.judgement.value}
    return _save_new(repos, project_id, fields, user)
