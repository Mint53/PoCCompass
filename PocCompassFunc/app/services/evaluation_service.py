"""Evaluation run, dashboard, snapshots, scheduled job — SPEC §4.4, §5, §6."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from datetime import date

from app.constants.enums import EvaluationTrigger, ProjectStatus
from app.core.clock import today_jst, utc_now_iso
from app.core.hashing import design_hash, task_content_hash
from app.models.common import UserContext
from app.models.dashboard import Dashboard
from app.models.evaluation import Evaluation
from app.models.project import ProjectSummary
from app.services import metrics
from app.services.access import load_project_for
from app.services.alignment_evaluator import evaluate_tasks
from app.services.context import Repos
from app.services.llm_client import LlmClient
from app.services.mode_service import get_mode

logger = logging.getLogger(__name__)


def run_evaluation(repos: Repos, llm: LlmClient, project: dict, trigger: EvaluationTrigger,
                   today: date | None = None) -> dict:
    today = today or today_jst()
    mode = get_mode(repos, project["mode"])
    items = repos.items.list(project["id"])
    by_type = metrics.ItemsByType.from_items(items)
    d_hash = design_hash(project["goal"], by_type.assumptions, by_type.criteria)

    previous = repos.evaluations.latest(project["id"])
    reusable: dict[str, dict] = {}
    if previous and previous.get("design_hash") == d_hash:
        reusable = {r["task_id"]: r for r in previous.get("task_results", [])}

    kept: list[dict] = []
    to_eval: list[dict] = []
    for t in by_type.tasks:
        prev = reusable.get(t["id"])
        if prev and prev.get("content_hash") == task_content_hash(t):
            kept.append({**prev, "reused": True})
        else:
            to_eval.append(t)

    fresh, calls = evaluate_tasks(llm, mode, project, by_type.assumptions, by_type.criteria, to_eval)
    results = kept + fresh
    evaluated_ids = {r["task_id"] for r in results}
    evaluation = Evaluation(
        id=str(uuid.uuid4()), projectId=project["id"], created_at=utc_now_iso(), trigger=trigger,
        model=llm.model_name, design_hash=d_hash, task_results=results, ai_calls=calls,
        unevaluated_task_ids=[t["id"] for t in by_type.tasks if t["id"] not in evaluated_ids],
    ).model_dump(mode="json")
    repos.evaluations.save(evaluation)
    _refresh_summary(repos, project, items, evaluation, mode, today)
    logger.info("evaluation saved project=%s tasks=%d fresh=%d reused=%d calls=%d", project["id"],
                len(by_type.tasks), len(fresh), len(kept), calls)
    return evaluation


def _refresh_summary(repos: Repos, project: dict, items: list[dict], evaluation: dict, mode: dict,
                     today: date) -> Dashboard:
    snapshots = repos.snapshots.list(project["id"])
    dash = metrics.compute_dashboard(project, items, evaluation, snapshots, mode["weights"], today)
    repos.snapshots.save({
        "id": f"{project['id']}:{today.isoformat()}", "projectId": project["id"], "date": today.isoformat(),
        "score": dash.health.score, "components": dash.health.components.model_dump(),
    })
    project["summary"] = ProjectSummary(
        health_score=dash.health.score, drift=dash.cards.drift, unnecessary=dash.cards.unnecessary,
        deadline_risk=dash.cards.deadline_risk, untested=dash.cards.untested, evaluated_at=evaluation["created_at"],
    ).model_dump()
    repos.projects.save(project)
    return dash


def evaluate_project(repos: Repos, llm: LlmClient, project_id: str, user: UserContext) -> dict:
    project = load_project_for(repos, project_id, user)
    return run_evaluation(repos, llm, project, EvaluationTrigger.MANUAL)


def latest_evaluation(repos: Repos, project_id: str, user: UserContext) -> dict | None:
    load_project_for(repos, project_id, user)
    doc = repos.evaluations.latest(project_id)
    return Evaluation.model_validate(doc).model_dump(mode="json") if doc else None


def build_dashboard(repos: Repos, project: dict, today: date | None = None) -> Dashboard:
    today = today or today_jst()
    mode = get_mode(repos, project["mode"])
    return metrics.compute_dashboard(project, repos.items.list(project["id"]),
                                     repos.evaluations.latest(project["id"]),
                                     repos.snapshots.list(project["id"]), mode["weights"], today)


def get_dashboard(repos: Repos, project_id: str, user: UserContext) -> dict:
    project = load_project_for(repos, project_id, user)
    return build_dashboard(repos, project).model_dump(mode="json")


def run_scheduled(repos: Repos, llm_factory: Callable[[], LlmClient], today: date | None = None) -> dict:
    """Daily job: evaluate every active project. One failure must not stop the others."""
    today = today or today_jst()
    ok, failed = 0, 0
    llm = llm_factory()
    for project in repos.projects.list_all():
        if project.get("status") != ProjectStatus.ACTIVE.value:
            continue
        try:
            run_evaluation(repos, llm, project, EvaluationTrigger.SCHEDULED, today)
            ok += 1
        except Exception:  # noqa: BLE001
            failed += 1
            logger.exception("scheduled evaluation failed project=%s", project["id"])
    logger.info("scheduled evaluation done ok=%d failed=%d", ok, failed)
    return {"ok": ok, "failed": failed}
