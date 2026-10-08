from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.controllers.deps import get_current_user, get_llm_client, get_repos
from app.models.chat import ChatApply, ChatMessage, ChatSend, ChatSendResponse
from app.models.common import UserContext
from app.services import chat_service
from app.services.context import Repos
from app.services.llm_client import LlmClient

router = APIRouter(prefix="/projects/{project_id}/chat", tags=["chat"])


@router.get("", response_model=list[ChatMessage])
def list_messages(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return chat_service.list_messages(repos, project_id, user)


@router.post("", response_model=ChatSendResponse, status_code=201)
def send(project_id: str, body: ChatSend, user: UserContext = Depends(get_current_user),
         repos: Repos = Depends(get_repos), llm: LlmClient = Depends(get_llm_client)):
    return chat_service.send_message(repos, llm, project_id, body.message, user)


@router.post("/{message_id}/apply", response_model=ChatMessage)
def apply(project_id: str, message_id: str, body: ChatApply | None = None,
          user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return chat_service.apply_proposal(repos, project_id, message_id, body.operation_indexes if body else None, user)


@router.post("/{message_id}/discard", response_model=ChatMessage)
def discard(project_id: str, message_id: str, user: UserContext = Depends(get_current_user),
            repos: Repos = Depends(get_repos)):
    return chat_service.discard_proposal(repos, project_id, message_id, user)


@router.delete("", status_code=204)
def clear(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    chat_service.clear_thread(repos, project_id, user)
    return Response(status_code=204)
