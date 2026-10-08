from __future__ import annotations

from pydantic import Field

from app.constants.enums import Decision
from app.models.common import ApiModel, StoredModel


class ReportOption(ApiModel):
    decision: Decision
    supporting: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)


class ReportContent(ApiModel):
    summary: str
    highlights: list[str] = Field(default_factory=list)
    options: list[ReportOption] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)


class Report(StoredModel):
    id: str
    projectId: str  # noqa: N815
    created_at: str
    created_by: str
    model: str
    health_score: int | None
    content: ReportContent


class ExtractRequest(ApiModel):
    text: str = Field(min_length=1)


class ExtractedTask(ApiModel):
    title: str
    description: str = ""
    linked_assumption_ids: list[str] = Field(default_factory=list)
    linked_criterion_ids: list[str] = Field(default_factory=list)


class ExtractResponse(ApiModel):
    tasks: list[ExtractedTask]
