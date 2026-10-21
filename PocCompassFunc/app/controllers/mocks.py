from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Response

from app.controllers.deps import get_current_user, get_llm_client, get_repos
from app.models.common import UserContext
from app.models.mock import (
    HandoffDraft,
    HandoffDraftRequest,
    HandoffSave,
    Screen,
    ScreenCreate,
    ScreenDetail,
    ScreenPatch,
    ScreenSend,
    ScreenSendResponse,
    ScreenVersion,
)
from app.services import mock_service
from app.services.context import Repos
from app.services.llm_client import LlmClient

router = APIRouter(prefix="/projects/{project_id}/screens", tags=["mocks"])


@router.get("", response_model=list[Screen])
def list_screens(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return mock_service.list_screens(repos, project_id, user)


@router.post("", response_model=Screen, status_code=201)
def create_screen(project_id: str, body: ScreenCreate, user: UserContext = Depends(get_current_user),
                  repos: Repos = Depends(get_repos)):
    return mock_service.create_screen(repos, project_id, body, user)


@router.get("/{screen_id}", response_model=ScreenDetail)
def get_screen(project_id: str, screen_id: str, user: UserContext = Depends(get_current_user),
               repos: Repos = Depends(get_repos)):
    return mock_service.get_screen_detail(repos, project_id, screen_id, user)


@router.patch("/{screen_id}", response_model=Screen)
def update_screen(project_id: str, screen_id: str, body: ScreenPatch, user: UserContext = Depends(get_current_user),
                  repos: Repos = Depends(get_repos)):
    return mock_service.update_screen(repos, project_id, screen_id, body, user)


@router.delete("/{screen_id}", status_code=204)
def delete_screen(project_id: str, screen_id: str, user: UserContext = Depends(get_current_user),
                  repos: Repos = Depends(get_repos)):
    mock_service.delete_screen(repos, project_id, screen_id, user)
    return Response(status_code=204)


@router.get("/{screen_id}/versions/{version_id}", response_model=ScreenVersion)
def get_version(project_id: str, screen_id: str, version_id: str, user: UserContext = Depends(get_current_user),
                repos: Repos = Depends(get_repos)):
    return mock_service.get_version(repos, project_id, screen_id, version_id, user)


@router.post("/{screen_id}/messages", response_model=ScreenSendResponse, status_code=201)
def send(project_id: str, screen_id: str, body: ScreenSend, user: UserContext = Depends(get_current_user),
         repos: Repos = Depends(get_repos), llm: LlmClient = Depends(get_llm_client)):
    return mock_service.send_message(repos, llm, project_id, screen_id, body, user)


@router.post("/{screen_id}/handoff/draft", response_model=HandoffDraft)
def draft_handoff(project_id: str, screen_id: str, body: HandoffDraftRequest,
                  user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos),
                  llm: LlmClient = Depends(get_llm_client)):
    return mock_service.draft_handoff(repos, llm, project_id, screen_id, body, user)


@router.put("/{screen_id}/handoff", response_model=Screen)
def save_handoff(project_id: str, screen_id: str, body: HandoffSave, user: UserContext = Depends(get_current_user),
                 repos: Repos = Depends(get_repos)):
    return mock_service.save_handoff(repos, project_id, screen_id, body, user)


@router.get("/{screen_id}/handoff/export", response_class=Response,
            responses={200: {"content": {"application/zip": {}}, "description": "引き渡しパック（ZIP）"}})
def export_handoff(project_id: str, screen_id: str, user: UserContext = Depends(get_current_user),
                   repos: Repos = Depends(get_repos)):
    name, data = mock_service.export_handoff(repos, project_id, screen_id, user)
    return Response(content=data, media_type="application/zip",
                    headers={"content-disposition": f"attachment; filename*=UTF-8''{quote(name)}"})
