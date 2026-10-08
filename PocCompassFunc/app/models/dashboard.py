from __future__ import annotations

from app.constants.enums import Priority, Verdict
from app.models.common import ApiModel


class HealthComponents(ApiModel):
    alignment: float | None
    validation: float | None
    schedule: float | None
    waste: float | None


class HealthView(ApiModel):
    score: int | None
    components: HealthComponents
    delta_vs_last_month: int | None
    computed_at: str | None


class Cards(ApiModel):
    drift: int
    unnecessary: int
    deadline_risk: int
    untested: int


class WeakTask(ApiModel):
    task_id: str
    title: str
    alignment_score: int
    gap: int
    verdict: Verdict
    reason: str


class UnderEvidenced(ApiModel):
    assumption_id: str
    text: str
    priority: Priority
    shortage: int
    evidence_count: int


class DeadlineRiskItem(ApiModel):
    kind: str  # "overdue_task" | "unmet_criterion"
    item_id: str
    text: str


class Alert(ApiModel):
    task_id: str
    title: str
    verdict: Verdict
    alignment_score: int
    reason: str
    suggested_action: str
    content_hash: str


class TrendPoint(ApiModel):
    date: str
    score: int | None


class ScheduleView(ApiModel):
    elapsed: float
    progress: float
    delayed: bool
    days_left: int


class VerdictCounts(ApiModel):
    aligned: int
    weak: int
    drift: int
    unnecessary: int
    dismissed: int
    pending: int


class EvidenceTally(ApiModel):
    assumption_id: str
    text: str
    supports: int
    refutes: int
    inconclusive: int


class Dashboard(ApiModel):
    health: HealthView
    cards: Cards
    schedule: ScheduleView
    weak_tasks: list[WeakTask]
    under_evidenced: list[UnderEvidenced]
    deadline_risks: list[DeadlineRiskItem]
    alerts: list[Alert]
    trend: list[TrendPoint]
    verdict_counts: VerdictCounts
    evidence_tally: list[EvidenceTally]
    stale_task_ids: list[str]
    unevaluated_task_ids: list[str]
    design_changed: bool
    last_evaluated_at: str | None
