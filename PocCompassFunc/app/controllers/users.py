from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response

from app.controllers.deps import get_current_user, get_repos
from app.models.common import UserContext
from app.models.user import UserBody, UserCreate, UserRecord
from app.services import user_service
from app.services.context import Repos

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRecord])
def search_users(q: str = Query(default=""), limit: int | None = Query(default=None, ge=1),
                 _: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return user_service.search_users(repos, q, limit)


@router.post("", response_model=UserRecord, status_code=201)
def create_user(body: UserCreate, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return user_service.create_user(repos, body, user)


@router.put("/{email}", response_model=UserRecord)
def update_user(email: str, body: UserBody, user: UserContext = Depends(get_current_user),
                repos: Repos = Depends(get_repos)):
    return user_service.update_user(repos, email, body, user)


@router.delete("/{email}", status_code=204)
def delete_user(email: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    user_service.delete_user(repos, email, user)
    return Response(status_code=204)
