from __future__ import annotations

from fastapi import APIRouter, Depends

from app.controllers.deps import get_current_user, get_repos
from app.models.common import UserContext
from app.models.mode import ModeDefinition, ModeDefinitionBody
from app.services import mode_service
from app.services.context import Repos

router = APIRouter(prefix="/modes", tags=["modes"])


@router.get("", response_model=list[ModeDefinition])
def list_modes(_: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return mode_service.list_modes(repos)


@router.get("/{mode_id}", response_model=ModeDefinition)
def get_mode(mode_id: str, _: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return mode_service.get_mode(repos, mode_id)


@router.put("/{mode_id}", response_model=ModeDefinition)
def update_mode(mode_id: str, body: ModeDefinitionBody, user: UserContext = Depends(get_current_user),
                repos: Repos = Depends(get_repos)):
    return mode_service.update_mode(repos, mode_id, body, user)


@router.post("/{mode_id}/reset", response_model=ModeDefinition)
def reset_mode(mode_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return mode_service.reset_mode(repos, mode_id, user)
