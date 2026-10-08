from __future__ import annotations

from app.constants.enums import FeedbackJudgement, Priority, TaskStatus, Verdict
from app.models.common import ApiModel


class CompassSector(ApiModel):
    id: str
    text: str
    priority: Priority


class CompassFrame(ApiModel):
    date: str
    health_score: int | None
    is_current: bool


class CompassPoint(ApiModel):
    score: int
    verdict: Verdict


class CompassTask(ApiModel):
    task_id: str
    title: str
    status: TaskStatus
    sector_id: str | None
    points: list[CompassPoint | None]
    needs_attention: bool
    feedback: FeedbackJudgement | None
    reason: str
    suggested_action: str


class Compass(ApiModel):
    sectors: list[CompassSector]
    frames: list[CompassFrame]
    tasks: list[CompassTask]
    attention_count: int
    health_score: int | None
    delta_vs_last_month: int | None
