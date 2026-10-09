from __future__ import annotations

import uuid

from app.constants.enums import AssumptionStatus, CriterionStatus, ItemType, MemberRole, ProjectStatus
from app.core.clock import today_jst, utc_now_iso
from app.core.errors import ValidationFailed
from app.models.common import UserContext
from app.models.project import Project, ProjectCreate, ProjectUpdate
from app.models.user import ProjectMember
from app.services import user_service
from app.services.access import ensure_owner, load_project_for, load_project_for_edit
from app.services.context import Repos


def _split_roles(owner: str, members: list[str], viewers: list[str]) -> tuple[list[str], list[str]]:
    """Owner is always an editor; a person listed as both editor and viewer is an editor."""
    editors = [owner, *[m for m in members if m != owner]]
    return editors, [v for v in viewers if v not in editors]


def _ensure_registered(repos: Repos, emails: list[str]) -> None:
    """Newly added members must be in the user master (SPEC section 9). Existing members are never re-checked."""
    unknown = [e for e in emails if not repos.users.get(e)]
    if unknown:
        raise ValidationFailed(
            f"ユーザーマスタに登録されていないユーザーです: {', '.join(unknown)}。管理者にユーザー登録を依頼してください。")


def _new_item(project_id: str, item_type: ItemType, user: UserContext, fields: dict) -> dict:
    now = utc_now_iso()
    return {"id": str(uuid.uuid4()), "projectId": project_id, "type": item_type.value, "created_at": now,
            "updated_at": now, "created_by": user.email, **fields}


def create_project(repos: Repos, body: ProjectCreate, user: UserContext) -> dict:
    now = utc_now_iso()
    start = body.start_date or today_jst()
    if body.deadline < start:
        raise ValidationFailed("期限は開始日以降の日付にしてください。")
    members, viewers = _split_roles(user.email, body.members, body.viewers)
    _ensure_registered(repos, [e for e in [*members, *viewers] if e != user.email])
    project = Project(
        id=str(uuid.uuid4()), mode=body.mode, title=body.title, goal=body.goal, start_date=start,
        deadline=body.deadline, status=ProjectStatus.ACTIVE, owner_email=user.email, members=members, viewers=viewers,
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
    project = load_project_for_edit(repos, project_id, user)
    patch = body.model_dump(mode="json", exclude_unset=True)
    if any(k in patch for k in ("members", "viewers", "mode")):
        ensure_owner(project, user)
    if patch.get("members") is not None or patch.get("viewers") is not None:
        current_viewers = project.get("viewers", [])
        members, viewers = _split_roles(
            project["owner_email"],
            patch["members"] if patch.get("members") is not None else project["members"],
            patch["viewers"] if patch.get("viewers") is not None else current_viewers)
        before = {*project["members"], *current_viewers}
        _ensure_registered(repos, [e for e in [*members, *viewers] if e not in before])
        patch["members"], patch["viewers"] = members, viewers
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


def list_members(repos: Repos, project_id: str, user: UserContext) -> list[dict]:
    project = load_project_for(repos, project_id, user)
    owner = project["owner_email"]
    roles = [(e, MemberRole.OWNER if e == owner else MemberRole.EDITOR) for e in project["members"]]
    roles += [(e, MemberRole.VIEWER) for e in project.get("viewers", [])]
    known = user_service.lookup(repos, [e for e, _ in roles])
    return [ProjectMember(email=e, name=known[e]["name"] if e in known else e,
                          department=known[e].get("department", "") if e in known else "", role=r).model_dump(mode="json")
            for e, r in roles]


def touch(repos: Repos, project: dict) -> None:
    project["updated_at"] = utc_now_iso()
    repos.projects.save(project)
