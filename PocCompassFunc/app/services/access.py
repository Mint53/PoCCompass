"""Authorization rules — SPEC §9."""

from __future__ import annotations

from app.core.errors import Forbidden, NotFound
from app.models.common import UserContext
from app.services.context import Repos

NOT_FOUND_MESSAGE = "取り組みが見つかりません。削除されたか、閲覧権限がありません。"
VIEW_ONLY_MESSAGE = "この取り組みは閲覧のみ可能です。編集が必要な場合は、作成者に編集者への変更を依頼してください。"


def load_project_for(repos: Repos, project_id: str, user: UserContext) -> dict:
    """Return the project if the user may see it; 404 otherwise (do not reveal existence)."""
    project = repos.projects.get(project_id)
    if not project or not (user.is_admin or user.email in project["members"] or user.email in project.get("viewers", [])):
        raise NotFound(NOT_FOUND_MESSAGE)
    return project


def load_project_for_edit(repos: Repos, project_id: str, user: UserContext) -> dict:
    """Like load_project_for, but viewers (read-only members) get 403 — they can see the project, so no 404 trick."""
    project = load_project_for(repos, project_id, user)
    if not (user.is_admin or user.email in project["members"]):
        raise Forbidden(VIEW_ONLY_MESSAGE)
    return project


def ensure_owner(project: dict, user: UserContext) -> None:
    if not (user.is_admin or project["owner_email"] == user.email):
        raise Forbidden("この操作は取り組みの作成者または管理者のみ実行できます。")


def ensure_admin(user: UserContext) -> None:
    if not user.is_admin:
        raise Forbidden("この操作は管理者のみ実行できます。")
