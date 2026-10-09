"""Project items (SPEC §3.2). One container, discriminated by `type`."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.constants.enums import (
    AssumptionStatus,
    CriterionStatus,
    Decision,
    EvidenceResult,
    FeedbackJudgement,
    Priority,
    ProcessVariant,
    RequestAction,
    RequestKind,
    TaskStatus,
)
from app.constants.limits import ASSIGNEE_MAX, NEXT_NOS_MAX, PROCESS_NO_MAX, TEXT_MAX, TITLE_MAX
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
    start_date: date | None = None
    due_date: date | None = None
    linked_assumption_ids: list[str] = Field(default_factory=list)
    linked_criterion_ids: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        return _strip_required(v)

    @model_validator(mode="after")
    def _start_before_due(self) -> TaskFields:
        if self.start_date and self.due_date and self.start_date > self.due_date:
            raise ValueError("開始日は期日以前にしてください")
        return self


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


class RequestFields(ApiModel):
    type: Literal["request"] = "request"
    kind: RequestKind = RequestKind.REQUEST
    title: str = Field(min_length=1, max_length=TITLE_MAX)
    description: str = Field(default="", max_length=TEXT_MAX)
    requester: str = Field(default="", max_length=ASSIGNEE_MAX)
    priority: Priority = Priority.MEDIUM
    action: RequestAction = RequestAction.UNDECIDED
    action_reason: str = Field(default="", max_length=TEXT_MAX)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        return _strip_required(v)


class ProcessStepFields(ApiModel):
    type: Literal["process_step"] = "process_step"
    variant: ProcessVariant
    no: str = Field(min_length=1, max_length=PROCESS_NO_MAX)
    assignee: str = Field(default="", max_length=ASSIGNEE_MAX)
    content: str = Field(min_length=1, max_length=TEXT_MAX)
    next_nos: list[str] = Field(default_factory=list, max_length=NEXT_NOS_MAX)

    @field_validator("no", "content")
    @classmethod
    def _strip_required_text(cls, v: str) -> str:
        return _strip_required(v)

    @field_validator("assignee")
    @classmethod
    def _strip_assignee(cls, v: str) -> str:
        return v.strip()

    @field_validator("next_nos")
    @classmethod
    def _clean_next_nos(cls, v: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(x.strip() for x in v if x.strip()))
        if any(len(x) > PROCESS_NO_MAX for x in cleaned):
            raise ValueError(f"次の業務Noは {PROCESS_NO_MAX} 字以内にしてください")
        return cleaned


class FeedbackFields(ApiModel):
    type: Literal["feedback"] = "feedback"
    task_id: str
    content_hash: str
    judgement: FeedbackJudgement


ItemCreate = Annotated[
    AssumptionFields | CriterionFields | TaskFields | EvidenceFields | DecisionFields | RequestFields
    | ProcessStepFields,
    Field(discriminator="type"),
]

CREATE_MODELS: dict[str, type[ApiModel]] = {
    "assumption": AssumptionFields,
    "criterion": CriterionFields,
    "task": TaskFields,
    "evidence": EvidenceFields,
    "decision": DecisionFields,
    "request": RequestFields,
    "process_step": ProcessStepFields,
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
    start_date: date | None = None
    due_date: date | None = None
    linked_assumption_ids: list[str] | None = None
    linked_criterion_ids: list[str] | None = None
    summary: str | None = None
    result: EvidenceResult | None = None
    source: str | None = None
    note: str | None = None
    kind: RequestKind | None = None
    action: RequestAction | None = None
    action_reason: str | None = None
    requester: str | None = None
    no: str | None = None
    assignee: str | None = None
    content: str | None = None
    next_nos: list[str] | None = None
    clear_effort_hours: bool = False
    clear_due_date: bool = False
    clear_start_date: bool = False


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


class Request(ItemMeta, RequestFields):
    pass


class ProcessStep(ItemMeta, ProcessStepFields):
    pass


class Feedback(ItemMeta, FeedbackFields):
    pass


Item = Annotated[
    Assumption | Criterion | Task | Evidence | DecisionItem | Request | ProcessStep | Feedback,
    Field(discriminator="type"),
]


class ProjectItems(ApiModel):
    assumptions: list[Assumption]
    criteria: list[Criterion]
    tasks: list[Task]
    evidence: list[Evidence]
    decisions: list[DecisionItem]
    requests: list[Request]
    process_steps: list[ProcessStep]
    feedback: list[Feedback]
