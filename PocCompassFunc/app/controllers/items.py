from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.controllers.deps import get_current_user, get_repos
from app.models.common import UserContext
from app.models.items import BulkTaskCreate, FeedbackCreate, Item, ItemCreate, ItemPatch, ProjectItems
from app.services import item_service
from app.services.context import Repos

router = APIRouter(prefix="/projects/{project_id}", tags=["items"])


@router.get("/items", response_model=ProjectItems)
def list_items(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return item_service.list_items(repos, project_id, user)


@router.post("/items", response_model=Item, status_code=201)
def create_item(project_id: str, body: ItemCreate, user: UserContext = Depends(get_current_user),
                repos: Repos = Depends(get_repos)):
    return item_service.create_item(repos, project_id, body, user)


@router.post("/items/bulk", response_model=list[Item], status_code=201)
def bulk_create(project_id: str, body: BulkTaskCreate, user: UserContext = Depends(get_current_user),
                repos: Repos = Depends(get_repos)):
    return item_service.bulk_create_tasks(repos, project_id, body, user)


@router.patch("/items/{item_id}", response_model=Item)
def update_item(project_id: str, item_id: str, body: ItemPatch, user: UserContext = Depends(get_current_user),
                repos: Repos = Depends(get_repos)):
    return item_service.update_item(repos, project_id, item_id, body, user)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(project_id: str, item_id: str, user: UserContext = Depends(get_current_user),
                repos: Repos = Depends(get_repos)):
    item_service.delete_item(repos, project_id, item_id, user)
    return Response(status_code=204)


@router.post("/feedback", response_model=Item, status_code=201)
def add_feedback(project_id: str, body: FeedbackCreate, user: UserContext = Depends(get_current_user),
                 repos: Repos = Depends(get_repos)):
    return item_service.add_feedback(repos, project_id, body, user)
