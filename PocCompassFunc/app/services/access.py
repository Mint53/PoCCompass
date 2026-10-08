"""Authorization rules — SPEC §9."""

from __future__ import annotations

from app.core.errors import Forbidden, NotFound
from app.models.common import UserContext
from app.services.context import Repos

NOT_FOUND_MESSAGE = "取り組みが見つかりません。削除されたか、閲覧権限がありません。"


def load_project_for(repos: Repos, project_id: str, user: UserContext) -> dict:
    """Return the project if the user may see it; 404 otherwise (do not reveal existence)."""
    project = repos.projects.get(project_id)
    if not project or not (user.is_admin or user.email in project["members"]):
        raise NotFound(NOT_FOUND_MESSAGE)
    return project


def ensure_owner(project: dict, user: UserContext) -> None:
    if not (user.is_admin or project["owner_email"] == user.email):
        raise Forbidden("この操作は取り組みの作成者または管理者のみ実行できます。")


def ensure_admin(user: UserContext) -> None:
    if not user.is_admin:
        raise Forbidden("この操作は管理者のみ実行できます。")
