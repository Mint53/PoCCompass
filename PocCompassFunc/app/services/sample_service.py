"""Create one fully filled-in sample project per mode (SPEC §17). Same data path as the screens: no AI, no special cases."""

from __future__ import annotations

from datetime import timedelta

from app.constants.enums import ItemType, Mode
from app.core.clock import today_jst
from app.models.common import UserContext
from app.models.items import CREATE_MODELS
from app.models.project import ProjectCreate
from app.services import item_service, project_service
from app.services.context import Repos
from app.services.sample_data import SAMPLE_TITLE_PREFIX, SAMPLES


def _add(repos: Repos, project_id: str, user: UserContext, fields: dict) -> dict:
    return item_service.create_item(repos, project_id, CREATE_MODELS[fields["type"]].model_validate(fields), user)


def _create_one(repos: Repos, mode: Mode, sample: dict, user: UserContext) -> dict:
    today = today_jst()
    project = project_service.create_project(repos, ProjectCreate(
        mode=mode, title=SAMPLE_TITLE_PREFIX + sample["title"], goal=sample["goal"],
        start_date=today + timedelta(days=sample["start"]), deadline=today + timedelta(days=sample["deadline"])), user)
    pid = project["id"]
    a_ids = [_add(repos, pid, user, {"type": ItemType.ASSUMPTION.value, "text": a["text"], "priority": a["priority"]})["id"]
             for a in sample["assumptions"]]
    c_ids = [_add(repos, pid, user, {"type": ItemType.CRITERION.value, "text": c["text"], "target": c["target"]})["id"]
             for c in sample["criteria"]]
    for t in sample["tasks"]:
        _add(repos, pid, user, {
            "type": ItemType.TASK.value, "title": t["title"], "status": t["status"], "effort_hours": t["hours"],
            "start_date": (today + timedelta(days=t["start"])).isoformat() if t["start"] is not None else None,
            "due_date": (today + timedelta(days=t["due"])).isoformat(),
            "linked_assumption_ids": [a_ids[i] for i in t["a"]], "linked_criterion_ids": [c_ids[i] for i in t["c"]]})
    for e in sample["evidence"]:
        _add(repos, pid, user, {"type": ItemType.EVIDENCE.value, "assumption_id": a_ids[e["assumption"]],
                                "summary": e["summary"], "result": e["result"], "source": e["source"]})
    for r in sample["requests"]:
        _add(repos, pid, user, {"type": ItemType.REQUEST.value, "kind": r["kind"], "title": r["title"],
                                "description": r["description"], "requester": r["requester"], "priority": r["priority"],
                                "action": r["action"], "action_reason": r["reason"]})
    for variant in ("asis", "tobe"):
        for s in sample[variant]:
            _add(repos, pid, user, {"type": ItemType.PROCESS_STEP.value, "variant": variant, "no": s["no"],
                                    "assignee": s["assignee"], "content": s["content"], "next_nos": s.get("next", [])})
    return project_service.get_project(repos, pid, user)


def create_samples(repos: Repos, user: UserContext) -> list[dict]:
    return [_create_one(repos, mode, sample, user) for mode, sample in SAMPLES.items()]
