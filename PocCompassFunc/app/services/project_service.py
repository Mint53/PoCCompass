from __future__ import annotations

import uuid

from app.constants.enums import AssumptionStatus, CriterionStatus, ItemType, ProjectStatus
from app.core.clock import today_jst, utc_now_iso
from app.core.errors import ValidationFailed
from app.models.common import UserContext
from app.models.project import Project, ProjectCreate, ProjectUpdate
from app.services.access import ensure_owner, load_project_for
from app.services.context import Repos


def _new_item(project_id: str, item_type: ItemType, user: UserContext, fields: dict) -> dict:
    now = utc_now_iso()
    return {"id": str(uuid.uuid4()), "projectId": project_id, "type": item_type.value, "created_at": now,
            "updated_at": now, "created_by": user.email, **fields}


def create_project(repos: Repos, body: ProjectCreate, user: UserContext) -> dict:
    now = utc_now_iso()
    start = body.start_date or today_jst()
    if body.deadline < start:
        raise ValidationFailed("期限は開始日以降の日付にしてください。")
    members = [user.email] + [m for m in body.members if m != user.email]
    project = Project(
        id=str(uuid.uuid4()), mode=body.mode, title=body.title, goal=body.goal, start_date=start,
        deadline=body.deadline, status=ProjectStatus.ACTIVE, owner_email=user.email, members=members,
        deleted=False, created_at=now, updated_at=now,
    ).model_dump(mode="json")
    repos.projects.save(project)
    for a in body.assumptions:
        repos.items.save(_new_item(project["id"], ItemType.ASSUMPTION, user, {
            "text": a.text.strip(), "status": AssumptionStatus.UNTESTED.value, "priority": a.priority.value}))
    for c in body.criteria:
        repos.items.save(_new_item(project["id"], ItemType.CRITERION, user, {
            "text": c.text.strip(), "target": c.target.strip(), "status": CriterionStatus.NOT_MET.value}))
    return project


def list_projects(repos: Repos, user: UserContext, mode: str | None = None) -> list[dict]:
    docs = repos.projects.list_all() if user.is_admin else repos.projects.list_for_member(user.email)
    if mode:
        docs = [d for d in docs if d["mode"] == mode]
    return [Project.model_validate(d).model_dump(mode="json") for d in docs]


def get_project(repos: Repos, project_id: str, user: UserContext) -> dict:
    return Project.model_validate(load_project_for(repos, project_id, user)).model_dump(mode="json")


def update_project(repos: Repos, project_id: str, body: ProjectUpdate, user: UserContext) -> dict:
    project = load_project_for(repos, project_id, user)
    patch = body.model_dump(mode="json", exclude_unset=True)
    if any(k in patch for k in ("members", "mode")):
        ensure_owner(project, user)
    if "members" in patch:
        members = patch["members"]
        if project["owner_email"] not in members:
            members = [project["owner_email"], *members]
        patch["members"] = members
    merged = {**project, **{k: v for k, v in patch.items() if v is not None}}
    if merged["deadline"] < merged["start_date"]:
        raise ValidationFailed("期限は開始日以降の日付にしてください。")
    merged["updated_at"] = utc_now_iso()
    validated = Project.model_validate(merged).model_dump(mode="json")
    repos.projects.save(validated)
    return validated


def delete_project(repos: Repos, project_id: str, user: UserContext) -> None:
    project = load_project_for(repos, project_id, user)
    ensure_owner(project, user)
    project["deleted"] = True
    project["updated_at"] = utc_now_iso()
    repos.projects.save(project)


def touch(repos: Repos, project: dict) -> None:
    project["updated_at"] = utc_now_iso()
    repos.projects.save(project)
