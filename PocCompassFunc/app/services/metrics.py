"""Deterministic rules and health score — docs/SPEC.md §5. Pure functions: no I/O, no AI, no clock.

Every number used here comes from app/constants/limits.py, which mirrors the spec.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.constants.enums import (
    AssumptionStatus,
    CriterionStatus,
    EvidenceResult,
    FeedbackJudgement,
    ItemType,
    Priority,
    TaskStatus,
    Verdict,
)
from app.constants.limits import (
    DELAY_GAP_THRESHOLD,
    DELTA_LOOKBACK_DAYS,
    EVIDENCE_DECISIVE_POINTS,
    EVIDENCE_INCONCLUSIVE_POINTS,
    SCHEDULE_PENALTY,
    TOP_N,
)
from app.core.hashing import design_hash, task_content_hash
from app.models.dashboard import (
    Alert,
    Cards,
    Dashboard,
    DeadlineRiskItem,
    EvidenceTally,
    HealthComponents,
    HealthView,
    ScheduleView,
    TrendPoint,
    UnderEvidenced,
    VerdictCounts,
    WeakTask,
)

_PROBLEM_VERDICTS = {Verdict.DRIFT.value, Verdict.UNNECESSARY.value}
_PRIORITY_ORDER = {Priority.HIGH.value: 0, Priority.MEDIUM.value: 1, Priority.LOW.value: 2}


@dataclass
class ItemsByType:
    assumptions: list[dict]
    criteria: list[dict]
    tasks: list[dict]
    evidence: list[dict]
    feedback: list[dict]

    @classmethod
    def from_items(cls, items: list[dict]) -> ItemsByType:
        def of(t: ItemType) -> list[dict]:
            return [i for i in items if i.get("type") == t.value]

        return cls(of(ItemType.ASSUMPTION), of(ItemType.CRITERION), of(ItemType.TASK), of(ItemType.EVIDENCE),
                   of(ItemType.FEEDBACK))


@dataclass
class TaskView:
    """A task joined with its usable evaluation result and feedback."""

    task: dict
    content_hash: str
    weight: float
    result: dict | None  # only when result.content_hash == current content hash
    has_stale_result: bool
    dismissed: bool


def _clip(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _parse_date(v: str | date) -> date:
    return v if isinstance(v, date) else date.fromisoformat(v)


def build_task_views(items: ItemsByType, evaluation: dict | None) -> list[TaskView]:
    results = {r["task_id"]: r for r in (evaluation or {}).get("task_results", [])}
    latest_feedback: dict[str, dict] = {}
    for fb in sorted(items.feedback, key=lambda f: f["created_at"]):
        latest_feedback[fb["task_id"]] = fb
    views: list[TaskView] = []
    for t in items.tasks:
        h = task_content_hash(t)
        r = results.get(t["id"])
        usable = r if r and r.get("content_hash") == h else None
        fb = latest_feedback.get(t["id"])
        dismissed = bool(fb and fb["judgement"] == FeedbackJudgement.DISMISS.value and fb["content_hash"] == h)
        views.append(TaskView(t, h, float(t.get("effort_hours") or 1.0), usable, bool(r) and usable is None, dismissed))
    return views


def schedule_state(project: dict, items: ItemsByType, today: date) -> ScheduleView:
    start = _parse_date(project["start_date"])
    deadline = _parse_date(project["deadline"])
    span = (deadline - start).days
    elapsed = 1.0 if span <= 0 else _clip((today - start).days / span, 0.0, 1.0)

    rates: list[float] = []
    if items.criteria:
        rates.append(sum(c["status"] == CriterionStatus.MET.value for c in items.criteria) / len(items.criteria))
    if items.tasks:
        rates.append(sum(t["status"] == TaskStatus.DONE.value for t in items.tasks) / len(items.tasks))
    progress = sum(rates) / len(rates) if rates else 0.0

    unmet = any(c["status"] != CriterionStatus.MET.value for c in items.criteria)
    delayed = (today > deadline and unmet) or (elapsed - progress > DELAY_GAP_THRESHOLD)
    return ScheduleView(elapsed=round(elapsed, 4), progress=round(progress, 4), delayed=delayed,
                        days_left=(deadline - today).days)


def health_components(project: dict, items: ItemsByType, views: list[TaskView], today: date) -> HealthComponents:
    evaluated = [v for v in views if v.result is not None]
    total_w = sum(v.weight for v in evaluated)

    alignment = None
    waste = None
    if evaluated and total_w > 0:
        alignment = sum((100.0 if v.dismissed else v.result["alignment_score"]) * v.weight for v in evaluated) / total_w
        problem_w = sum(v.weight for v in evaluated if not v.dismissed and v.result["verdict"] in _PROBLEM_VERDICTS)
        waste = 100.0 - problem_w / total_w * 100.0

    validation = None
    if items.assumptions:
        ev_count: dict[str, int] = {}
        for e in items.evidence:
            ev_count[e["assumption_id"]] = ev_count.get(e["assumption_id"], 0) + 1
        points = []
        for a in items.assumptions:
            if a["status"] in (AssumptionStatus.SUPPORTED.value, AssumptionStatus.REJECTED.value):
                points.append(100.0)
            elif a["status"] == AssumptionStatus.TESTING.value or ev_count.get(a["id"], 0) > 0:
                points.append(50.0)
            else:
                points.append(0.0)
        validation = sum(points) / len(points)

    sched = schedule_state(project, items, today)
    unmet = any(c["status"] != CriterionStatus.MET.value for c in items.criteria)
    if today > _parse_date(project["deadline"]) and unmet:
        schedule = 0.0
    else:
        schedule = _clip(100.0 - max(0.0, sched.elapsed - sched.progress) * SCHEDULE_PENALTY)

    def r(v: float | None) -> float | None:
        return None if v is None else round(v, 1)

    return HealthComponents(alignment=r(alignment), validation=r(validation), schedule=r(schedule), waste=r(waste))


def combine(components: HealthComponents, weights: dict[str, float]) -> int | None:
    num = 0.0
    den = 0.0
    for key in ("alignment", "validation", "schedule", "waste"):
        value = getattr(components, key)
        if value is None:
            continue
        num += weights[key] * value
        den += weights[key]
    if den <= 0:
        return None
    return int(round(num / den))


def delta_vs_last_month(score: int | None, snapshots: list[dict], today: date) -> int | None:
    if score is None:
        return None
    cutoff = today - timedelta(days=DELTA_LOOKBACK_DAYS)
    older = [s for s in snapshots if _parse_date(s["date"]) <= cutoff and s.get("score") is not None]
    if not older:
        return None
    base = max(older, key=lambda s: s["date"])
    return score - int(base["score"])


def compute_health(project: dict, items: list[dict], evaluation: dict | None, weights: dict[str, float],
                   today: date) -> tuple[int | None, HealthComponents]:
    by_type = ItemsByType.from_items(items)
    views = build_task_views(by_type, evaluation)
    comps = health_components(project, by_type, views, today)
    return combine(comps, weights), comps


def compute_dashboard(project: dict, items: list[dict], evaluation: dict | None, snapshots: list[dict],
                      weights: dict[str, float], today: date) -> Dashboard:
    by_type = ItemsByType.from_items(items)
    views = build_task_views(by_type, evaluation)
    comps = health_components(project, by_type, views, today)
    score = combine(comps, weights)
    sched = schedule_state(project, by_type, today)

    active_problem = [v for v in views if v.result and not v.dismissed and v.result["verdict"] in _PROBLEM_VERDICTS]
    drift = sum(v.result["verdict"] == Verdict.DRIFT.value for v in active_problem)
    unnecessary = sum(v.result["verdict"] == Verdict.UNNECESSARY.value for v in active_problem)

    # deadline risks
    risks: list[DeadlineRiskItem] = []
    for t in by_type.tasks:
        if t.get("due_date") and t["status"] != TaskStatus.DONE.value and _parse_date(t["due_date"]) < today:
            risks.append(DeadlineRiskItem(kind="overdue_task", item_id=t["id"], text=t["title"]))
    if sched.delayed:
        for c in by_type.criteria:
            if c["status"] != CriterionStatus.MET.value:
                risks.append(DeadlineRiskItem(kind="unmet_criterion", item_id=c["id"], text=c["text"]))

    # evidence stats
    decisive: dict[str, int] = {}
    inconclusive: dict[str, int] = {}
    for e in by_type.evidence:
        bucket = inconclusive if e["result"] == EvidenceResult.INCONCLUSIVE.value else decisive
        bucket[e["assumption_id"]] = bucket.get(e["assumption_id"], 0) + 1

    untested = sum(
        1 for a in by_type.assumptions
        if a["status"] == AssumptionStatus.UNTESTED.value
        and decisive.get(a["id"], 0) + inconclusive.get(a["id"], 0) == 0
    )

    under: list[UnderEvidenced] = []
    for a in by_type.assumptions:
        if a["status"] in (AssumptionStatus.SUPPORTED.value, AssumptionStatus.REJECTED.value):
            continue
        d, i = decisive.get(a["id"], 0), inconclusive.get(a["id"], 0)
        shortage = max(0, 100 - EVIDENCE_DECISIVE_POINTS * d - EVIDENCE_INCONCLUSIVE_POINTS * i)
        under.append(UnderEvidenced(assumption_id=a["id"], text=a["text"], priority=a["priority"],
                                    shortage=shortage, evidence_count=d + i))
    under.sort(key=lambda u: (_PRIORITY_ORDER[u.priority.value], -u.shortage))

    ranked = sorted((v for v in views if v.result and not v.dismissed), key=lambda v: v.result["alignment_score"])
    weak = [
        WeakTask(task_id=v.task["id"], title=v.task["title"], alignment_score=v.result["alignment_score"],
                 gap=100 - v.result["alignment_score"], verdict=v.result["verdict"], reason=v.result.get("reason", ""))
        for v in ranked[:TOP_N]
    ]

    alerts = [
        Alert(task_id=v.task["id"], title=v.task["title"], verdict=v.result["verdict"],
              alignment_score=v.result["alignment_score"], reason=v.result.get("reason", ""),
              suggested_action=v.result.get("suggested_action", ""), content_hash=v.content_hash)
        for v in sorted(active_problem, key=lambda v: v.result["alignment_score"])
    ]

    # analysis charts (SPEC §12): dismissed tasks are shown apart so the bars add up to the task count
    dismissed = sum(1 for v in views if v.result and v.dismissed)
    by_verdict = {k.value: 0 for k in Verdict}
    for v in views:
        if v.result and not v.dismissed:
            by_verdict[v.result["verdict"]] += 1
    verdict_counts = VerdictCounts(
        aligned=by_verdict[Verdict.ALIGNED.value], weak=by_verdict[Verdict.WEAK.value],
        drift=by_verdict[Verdict.DRIFT.value], unnecessary=by_verdict[Verdict.UNNECESSARY.value],
        dismissed=dismissed, pending=sum(1 for v in views if v.result is None),
    )
    tally: dict[str, dict[str, int]] = {a["id"]: {r.value: 0 for r in EvidenceResult} for a in by_type.assumptions}
    for e in by_type.evidence:
        if e["assumption_id"] in tally:
            tally[e["assumption_id"]][e["result"]] += 1
    evidence_tally = [
        EvidenceTally(assumption_id=a["id"], text=a["text"], supports=tally[a["id"]][EvidenceResult.SUPPORTS.value],
                      refutes=tally[a["id"]][EvidenceResult.REFUTES.value],
                      inconclusive=tally[a["id"]][EvidenceResult.INCONCLUSIVE.value])
        for a in by_type.assumptions
    ]

    current_design = design_hash(project["goal"], by_type.assumptions, by_type.criteria)
    return Dashboard(
        health=HealthView(score=score, components=comps, delta_vs_last_month=delta_vs_last_month(score, snapshots, today),
                          computed_at=(evaluation or {}).get("created_at")),
        cards=Cards(drift=drift, unnecessary=unnecessary, deadline_risk=len(risks), untested=untested),
        schedule=sched,
        weak_tasks=weak,
        under_evidenced=under[:TOP_N],
        deadline_risks=risks,
        alerts=alerts,
        verdict_counts=verdict_counts,
        evidence_tally=evidence_tally,
        trend=[TrendPoint(date=s["date"], score=s.get("score")) for s in snapshots[-90:]],
        stale_task_ids=[v.task["id"] for v in views if v.has_stale_result],
        unevaluated_task_ids=[v.task["id"] for v in views if v.result is None and not v.has_stale_result],
        design_changed=bool(evaluation) and evaluation.get("design_hash") != current_design,
        last_evaluated_at=(evaluation or {}).get("created_at"),
    )
