"""FastAPI dependencies: current user, repositories, LLM. Tests override these via app.dependency_overrides."""

from __future__ import annotations

from urllib.parse import unquote

from fastapi import Depends, Request

from app.config.settings import get_settings
from app.constants.enums import UserRole
from app.core.errors import Unauthenticated
from app.models.common import UserContext
from app.services import user_service
from app.services.context import Repos, default_repos
from app.services.llm_client import LlmClient, get_llm

USER_EMAIL_HEADER = "x-poccompass-user-email"
USER_NAME_HEADER = "x-poccompass-user-name"  # URL-encoded (UTF-8) by the Next.js proxy


def get_repos() -> Repos:
    return default_repos()


def get_current_user(request: Request, repos: Repos = Depends(get_repos)) -> UserContext:
    s = get_settings()
    email = (request.headers.get(USER_EMAIL_HEADER) or "").strip().lower()
    name = unquote(request.headers.get(USER_NAME_HEADER) or "").strip()
    if not email and not s.running_on_azure and s.dev_user_email:
        email, name = s.dev_user_email, s.dev_user_name or s.dev_user_email
    if not email:
        raise Unauthenticated("ログイン情報を確認できませんでした。画面を再読み込みしてサインインし直してください。")
    role, department = user_service.effective_role(repos, email)
    return UserContext(email=email, name=name or email, department=department, role=role, is_admin=role == UserRole.ADMIN)


def get_llm_client() -> LlmClient:
    return get_llm()
