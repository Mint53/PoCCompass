from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config.settings import get_settings
from app.controllers.deps import get_current_user
from app.models.common import UserContext

router = APIRouter(tags=["common"])


class HealthResponse(BaseModel):
    status: str
    storage: str
    ai_configured: bool


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    s = get_settings()
    return HealthResponse(status="ok", storage=s.storage_backend, ai_configured=s.ai_configured)


@router.get("/me", response_model=UserContext)
def me(user: UserContext = Depends(get_current_user)) -> UserContext:
    return user
