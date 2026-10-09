from __future__ import annotations

from datetime import date

from pydantic import Field, field_validator, model_validator

from app.constants.enums import Mode, Priority, ProjectStatus
from app.constants.limits import GOAL_MAX, TEXT_MAX, TITLE_MAX
from app.models.common import ApiModel, StoredModel


def _normalize_emails(values: list[str]) -> list[str]:
    out: list[str] = []
    for v in values:
        e = v.strip().lower()
        if not e:
            continue
        if "@" not in e or " " in e:
            raise ValueError(f"メールアドレスの形式が正しくありません: {v}")
        if e not in out:
            out.append(e)
    return out


class AssumptionSeed(ApiModel):
    text: str = Field(min_length=1, max_length=TEXT_MAX)
    priority: Priority = Priority.MEDIUM


class CriterionSeed(ApiModel):
    text: str = Field(min_length=1, max_length=TEXT_MAX)
    target: str = Field(default="", max_length=200)


class ProjectCreate(ApiModel):
    mode: Mode
    title: str = Field(min_length=1, max_length=TITLE_MAX)
    goal: str = Field(min_length=1, max_length=GOAL_MAX)
    start_date: date | None = None
    deadline: date
    members: list[str] = Field(default_factory=list)
    viewers: list[str] = Field(default_factory=list)
    share_with_department: bool = False
    assumptions: list[AssumptionSeed] = Field(default_factory=list)
    criteria: list[CriterionSeed] = Field(default_factory=list)

    @field_validator("members", "viewers")
    @classmethod
    def _members(cls, v: list[str]) -> list[str]:
        return _normalize_emails(v)

    @field_validator("title", "goal")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("空にできません")
        return v

    @model_validator(mode="after")
    def _dates(self) -> ProjectCreate:
        if self.start_date and self.deadline < self.start_date:
            raise ValueError("期限は開始日以降の日付にしてください")
        return self


class ProjectUpdate(ApiModel):
    mode: Mode | None = None
    title: str | None = Field(default=None, min_length=1, max_length=TITLE_MAX)
    goal: str | None = Field(default=None, min_length=1, max_length=GOAL_MAX)
    start_date: date | None = None
    deadline: date | None = None
    status: ProjectStatus | None = None
    members: list[str] | None = None
    viewers: list[str] | None = None
    share_with_department: bool | None = None

    @field_validator("members", "viewers")
    @classmethod
    def _members(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _normalize_emails(v)


class ProjectSummary(ApiModel):
    """Snapshot of dashboard numbers stored on the project at evaluation time (for the list view)."""

    health_score: int | None = None
    drift: int = 0
    unnecessary: int = 0
    deadline_risk: int = 0
    untested: int = 0
    evaluated_at: str | None = None


class Project(StoredModel):
    id: str
    mode: Mode
    title: str
    goal: str
    start_date: date
    deadline: date
    status: ProjectStatus = ProjectStatus.ACTIVE
    owner_email: str
    members: list[str]
    viewers: list[str] = Field(default_factory=list)
    shared_department: str = ""
    deleted: bool = False
    created_at: str
    updated_at: str
    summary: ProjectSummary = Field(default_factory=ProjectSummary)
