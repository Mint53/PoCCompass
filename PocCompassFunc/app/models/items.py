"""Project items (SPEC §3.2). One container, discriminated by `type`."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, field_validator

from app.constants.enums import (
    AssumptionStatus,
    CriterionStatus,
    Decision,
    EvidenceResult,
    FeedbackJudgement,
    Priority,
    TaskStatus,
)
from app.constants.limits import TEXT_MAX, TITLE_MAX
from app.models.common import ApiModel, StoredModel


def _strip_required(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("空にできません")
    return v


# ---------- create payloads (what the client sends) ----------


class AssumptionFields(ApiModel):
    type: Literal["assumption"] = "assumption"
    text: str = Field(min_length=1, max_length=TEXT_MAX)
    status: AssumptionStatus = AssumptionStatus.UNTESTED
    priority: Priority = Priority.MEDIUM

    @field_validator("text")
    @classmethod
    def _strip_text(cls, v: str) -> str:
        return _strip_required(v)


class CriterionFields(ApiModel):
    type: Literal["criterion"] = "criterion"
    text: str = Field(min_length=1, max_length=TEXT_MAX)
    target: str = Field(default="", max_length=200)
    status: CriterionStatus = CriterionStatus.NOT_MET

    @field_validator("text")
    @classmethod
    def _strip_text(cls, v: str) -> str:
        return _strip_required(v)


class TaskFields(ApiModel):
    type: Literal["task"] = "task"
    title: str = Field(min_length=1, max_length=TITLE_MAX)
    description: str = Field(default="", max_length=TEXT_MAX)
    status: TaskStatus = TaskStatus.TODO
    effort_hours: float | None = Field(default=None, gt=0, le=10000)
    due_date: date | None = None
    linked_assumption_ids: list[str] = Field(default_factory=list)
    linked_criterion_ids: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        return _strip_required(v)


class EvidenceFields(ApiModel):
    type: Literal["evidence"] = "evidence"
    assumption_id: str = Field(min_length=1)
    summary: str = Field(min_length=1, max_length=TEXT_MAX)
    result: EvidenceResult
    source: str = Field(default="", max_length=500)

    @field_validator("summary")
    @classmethod
    def _strip_summary(cls, v: str) -> str:
        return _strip_required(v)


class DecisionFields(ApiModel):
    type: Literal["decision"] = "decision"
    decision: Decision
    note: str = Field(default="", max_length=TEXT_MAX)


class FeedbackFields(ApiModel):
    type: Literal["feedback"] = "feedback"
    task_id: str
    content_hash: str
    judgement: FeedbackJudgement


ItemCreate = Annotated[
    AssumptionFields | CriterionFields | TaskFields | EvidenceFields | DecisionFields,
    Field(discriminator="type"),
]

CREATE_MODELS: dict[str, type[ApiModel]] = {
    "assumption": AssumptionFields,
    "criterion": CriterionFields,
    "task": TaskFields,
    "evidence": EvidenceFields,
    "decision": DecisionFields,
    "feedback": FeedbackFields,
}


class ItemPatch(ApiModel):
    """Partial update. The service merges it into the stored item and re-validates with the type's model."""

    text: str | None = None
    status: str | None = None
    priority: Priority | None = None
    target: str | None = None
    title: str | None = None
    description: str | None = None
    effort_hours: float | None = None
    due_date: date | None = None
    linked_assumption_ids: list[str] | None = None
    linked_criterion_ids: list[str] | None = None
    summary: str | None = None
    result: EvidenceResult | None = None
    source: str | None = None
    note: str | None = None
    clear_effort_hours: bool = False
    clear_due_date: bool = False


class BulkTaskCreate(ApiModel):
    tasks: list[TaskFields] = Field(min_length=1, max_length=50)


class FeedbackCreate(ApiModel):
    task_id: str
    judgement: FeedbackJudgement


# ---------- stored / response models ----------


class ItemMeta(StoredModel):
    id: str
    projectId: str  # noqa: N815 - matches Cosmos partition key path
    created_at: str
    updated_at: str
    created_by: str


class Assumption(ItemMeta, AssumptionFields):
    pass


class Criterion(ItemMeta, CriterionFields):
    pass


class Task(ItemMeta, TaskFields):
    pass


class Evidence(ItemMeta, EvidenceFields):
    pass


class DecisionItem(ItemMeta, DecisionFields):
    pass


class Feedback(ItemMeta, FeedbackFields):
    pass


Item = Annotated[
    Assumption | Criterion | Task | Evidence | DecisionItem | Feedback,
    Field(discriminator="type"),
]


class ProjectItems(ApiModel):
    assumptions: list[Assumption]
    criteria: list[Criterion]
    tasks: list[Task]
    evidence: list[Evidence]
    decisions: list[DecisionItem]
    feedback: list[Feedback]
