"""Decision report (SPEC §7) and task extraction (SPEC §8)."""

from __future__ import annotations

import uuid

from app.constants.enums import Decision, ItemType
from app.constants.limits import EXTRACT_MAX_CHARS, TITLE_MAX
from app.core.clock import utc_now_iso
from app.core.errors import AiFailed, ValidationFailed
from app.models.common import UserContext
from app.models.report import ExtractResponse, Report, ReportContent
from app.services.access import load_project_for
from app.services.context import Repos
from app.services.evaluation_service import build_dashboard
from app.services.llm_client import LlmClient
from app.services.mode_service import get_mode
from app.services.prompts import (
    EXTRACT_SCHEMA,
    REPORT_SCHEMA,
    AliasMap,
    extract_system_prompt,
    extract_user_prompt,
    report_system_prompt,
    report_user_prompt,
)

_DECISION_ORDER = [Decision.CONTINUE.value, Decision.PIVOT.value, Decision.STOP.value]


def generate_report(repos: Repos, llm: LlmClient, project_id: str, user: UserContext) -> dict:
    project = load_project_for(repos, project_id, user)
    mode = get_mode(repos, project["mode"])
    items = repos.items.list(project_id)

    def of(t: ItemType) -> list[dict]:
        return [i for i in items if i["type"] == t.value]

    dash = build_dashboard(repos, project).model_dump(mode="json")
    raw = llm.complete_json(
        system=report_system_prompt(mode),
        user=report_user_prompt(project, mode, of(ItemType.ASSUMPTION), of(ItemType.CRITERION), of(ItemType.TASK),
                                of(ItemType.EVIDENCE), dash),
        schema_name="decision_report", schema=REPORT_SCHEMA,
    )
    try:
        content = ReportContent.model_validate(raw)
    except Exception as e:  # noqa: BLE001
        raise AiFailed("AI の出力を読み取れませんでした。もう一度実行してください。") from e
    # exactly one option per decision, fixed order (SPEC §7)
    by_decision = {o.decision.value: o for o in content.options}
    content.options = [by_decision[d] for d in _DECISION_ORDER if d in by_decision]
    report = Report(id=str(uuid.uuid4()), projectId=project_id, created_at=utc_now_iso(), created_by=user.email,
                    model=llm.model_name, health_score=dash["health"]["score"], content=content)
    doc = report.model_dump(mode="json")
    repos.reports.save(doc)
    return doc


def list_reports(repos: Repos, project_id: str, user: UserContext) -> list[dict]:
    load_project_for(repos, project_id, user)
    return [Report.model_validate(d).model_dump(mode="json") for d in repos.reports.list(project_id)]


def extract_tasks(repos: Repos, llm: LlmClient, project_id: str, text: str, user: UserContext) -> dict:
    project = load_project_for(repos, project_id, user)
    text = text.strip()
    if not text:
        raise ValidationFailed("テキストを入力してください。")
    if len(text) > EXTRACT_MAX_CHARS:
        raise ValidationFailed(f"テキストは {EXTRACT_MAX_CHARS} 字以内にしてください（現在 {len(text)} 字）。")
    mode = get_mode(repos, project["mode"])
    assumptions = repos.items.list(project_id, ItemType.ASSUMPTION)
    criteria = repos.items.list(project_id, ItemType.CRITERION)
    tasks = repos.items.list(project_id, ItemType.TASK)
    amap = AliasMap("A", [a["id"] for a in assumptions])
    cmap = AliasMap("C", [c["id"] for c in criteria])
    raw = llm.complete_json(system=extract_system_prompt(mode),
                            user=extract_user_prompt(text, assumptions, criteria, tasks, amap, cmap),
                            schema_name="task_extraction", schema=EXTRACT_SCHEMA)
    out = []
    for t in raw.get("tasks") or []:
        title = str(t.get("title", "")).strip()[:TITLE_MAX]
        if not title:
            continue
        out.append({
            "title": title,
            "description": str(t.get("description", "")).strip(),
            "linked_assumption_ids": amap.resolve(list(t.get("linked_assumption_ids") or [])),
            "linked_criterion_ids": cmap.resolve(list(t.get("linked_criterion_ids") or [])),
        })
    return ExtractResponse.model_validate({"tasks": out}).model_dump(mode="json")
