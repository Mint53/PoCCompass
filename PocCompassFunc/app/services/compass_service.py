"""Compass view (SPEC §13). Deterministic: reuses metrics.py, never calls the LLM."""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.constants.enums import FeedbackJudgement, Verdict
from app.constants.limits import COMPASS_MAX_FRAMES
from app.core.clock import JST, today_jst
from app.models.common import UserContext
from app.models.compass import Compass, CompassFrame, CompassPoint, CompassSector, CompassTask
from app.services import metrics
from app.services.access import load_project_for
from app.services.context import Repos
from app.services.mode_service import get_mode

_PROBLEM = {Verdict.DRIFT.value, Verdict.UNNECESSARY.value}


def _point(result: dict | None) -> CompassPoint | None:
    if not result:
        return None
    return CompassPoint(score=result["alignment_score"], verdict=result["verdict"])


def _jst_date(created_at: str) -> str:
    dt = datetime.fromisoformat(created_at)
    return (dt if dt.tzinfo else dt.replace(tzinfo=UTC)).astimezone(JST).date().isoformat()


def build_compass(repos: Repos, project: dict, today: date | None = None) -> Compass:
    today = today or today_jst()
    pid = project["id"]
    mode = get_mode(repos, project["mode"])
    items = repos.items.list(pid)
    by_type = metrics.ItemsByType.from_items(items)
    latest = repos.evaluations.latest(pid)
    snapshots = repos.snapshots.list(pid)
    dash = metrics.compute_dashboard(project, items, latest, snapshots, mode["weights"], today)
    views = metrics.build_task_views(by_type, latest)

    past = repos.evaluations.recent(pid, COMPASS_MAX_FRAMES - 1)  # newest first
    past = list(reversed(past))
    score_by_date = {s["date"]: s.get("score") for s in snapshots}
    frames = [CompassFrame(date=(d := _jst_date(e["created_at"])), health_score=score_by_date.get(d), is_current=False)
              for e in past]
    frames.append(CompassFrame(date=today.isoformat(), health_score=dash.health.score, is_current=True))
    past_results = [{r["task_id"]: r for r in e.get("task_results", [])} for e in past]

    assumption_ids = {a["id"] for a in by_type.assumptions}
    latest_fb: dict[str, dict] = {}
    for fb in sorted(by_type.feedback, key=lambda f: f["created_at"]):
        latest_fb[fb["task_id"]] = fb

    tasks: list[CompassTask] = []
    for v in views:
        t = v.task
        sector = next((i for i in t.get("linked_assumption_ids", []) if i in assumption_ids), None)
        fb = latest_fb.get(t["id"])
        feedback = FeedbackJudgement(fb["judgement"]) if fb and fb["content_hash"] == v.content_hash else None
        res = v.result
        tasks.append(CompassTask(
            task_id=t["id"], title=t["title"], status=t["status"], sector_id=sector,
            points=[*(_point(r.get(t["id"])) for r in past_results), _point(res)],
            needs_attention=bool(res and res["verdict"] in _PROBLEM and not v.dismissed),
            feedback=feedback,
            reason=(res or {}).get("reason", ""), suggested_action=(res or {}).get("suggested_action", ""),
        ))

    return Compass(
        sectors=[CompassSector(id=a["id"], text=a["text"], priority=a["priority"]) for a in by_type.assumptions],
        frames=frames, tasks=tasks,
        attention_count=sum(t.needs_attention for t in tasks),
        health_score=dash.health.score, delta_vs_last_month=dash.health.delta_vs_last_month,
    )


def get_compass(repos: Repos, project_id: str, user: UserContext) -> dict:
    project = load_project_for(repos, project_id, user)
    return build_compass(repos, project).model_dump(mode="json")
