from __future__ import annotations

from pydantic import Field

from app.constants.enums import EvaluationTrigger, Verdict
from app.models.common import ApiModel, StoredModel


class TaskResult(ApiModel):
    task_id: str
    content_hash: str
    alignment_score: int = Field(ge=0, le=100)
    verdict: Verdict
    linked_assumption_ids: list[str] = Field(default_factory=list)
    linked_criterion_ids: list[str] = Field(default_factory=list)
    reason: str = ""
    suggested_action: str = ""
    reused: bool = False


class Evaluation(StoredModel):
    id: str
    projectId: str  # noqa: N815
    created_at: str
    trigger: EvaluationTrigger
    model: str
    design_hash: str
    task_results: list[TaskResult]
    ai_calls: int = 0
    unevaluated_task_ids: list[str] = Field(default_factory=list)
