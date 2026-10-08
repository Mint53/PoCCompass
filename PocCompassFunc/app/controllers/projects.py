from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response

from app.constants.enums import Mode
from app.controllers.deps import get_current_user, get_llm_client, get_repos
from app.models.common import UserContext
from app.models.compass import Compass
from app.models.dashboard import Dashboard
from app.models.evaluation import Evaluation
from app.models.project import Project, ProjectCreate, ProjectUpdate
from app.models.report import ExtractRequest, ExtractResponse, Report
from app.services import compass_service, evaluation_service, project_service, report_service
from app.services.context import Repos
from app.services.llm_client import LlmClient

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[Project])
def list_projects(mode: Mode | None = Query(default=None), user: UserContext = Depends(get_current_user),
                  repos: Repos = Depends(get_repos)):
    return project_service.list_projects(repos, user, mode.value if mode else None)


@router.post("", response_model=Project, status_code=201)
def create_project(body: ProjectCreate, user: UserContext = Depends(get_current_user),
                   repos: Repos = Depends(get_repos)):
    return project_service.create_project(repos, body, user)


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return project_service.get_project(repos, project_id, user)


@router.patch("/{project_id}", response_model=Project)
def update_project(project_id: str, body: ProjectUpdate, user: UserContext = Depends(get_current_user),
                   repos: Repos = Depends(get_repos)):
    return project_service.update_project(repos, project_id, body, user)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    project_service.delete_project(repos, project_id, user)
    return Response(status_code=204)


@router.get("/{project_id}/dashboard", response_model=Dashboard)
def dashboard(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return evaluation_service.get_dashboard(repos, project_id, user)


@router.get("/{project_id}/compass", response_model=Compass)
def compass(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return compass_service.get_compass(repos, project_id, user)


@router.post("/{project_id}/evaluations", response_model=Evaluation, status_code=201)
def evaluate(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos),
             llm: LlmClient = Depends(get_llm_client)):
    return evaluation_service.evaluate_project(repos, llm, project_id, user)


@router.get("/{project_id}/evaluations/latest", response_model=Evaluation | None)
def latest_evaluation(project_id: str, user: UserContext = Depends(get_current_user),
                      repos: Repos = Depends(get_repos)):
    return evaluation_service.latest_evaluation(repos, project_id, user)


@router.get("/{project_id}/reports", response_model=list[Report])
def list_reports(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return report_service.list_reports(repos, project_id, user)


@router.post("/{project_id}/reports", response_model=Report, status_code=201)
def create_report(project_id: str, user: UserContext = Depends(get_current_user), repos: Repos = Depends(get_repos),
                  llm: LlmClient = Depends(get_llm_client)):
    return report_service.generate_report(repos, llm, project_id, user)


@router.post("/{project_id}/tasks/extract", response_model=ExtractResponse)
def extract_tasks(project_id: str, body: ExtractRequest, user: UserContext = Depends(get_current_user),
                  repos: Repos = Depends(get_repos), llm: LlmClient = Depends(get_llm_client)):
    return report_service.extract_tasks(repos, llm, project_id, body.text, user)
