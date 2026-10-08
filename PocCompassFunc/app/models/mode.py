from __future__ import annotations

from pydantic import Field, model_validator

from app.constants.enums import Mode
from app.models.common import ApiModel, StoredModel


class ModeLabels(ApiModel):
    goal: str
    assumption: str
    criterion: str
    deadline: str
    task: str
    evidence: str
    decision_continue: str
    decision_pivot: str
    decision_stop: str


class CardLabels(ApiModel):
    drift: str
    drift_hint: str
    unnecessary: str
    unnecessary_hint: str
    deadline_risk: str
    deadline_risk_hint: str
    untested: str
    untested_hint: str
    weak_tasks_title: str
    under_evidenced_title: str


class Placeholders(ApiModel):
    title: str
    goal: str
    assumption: str
    criterion: str
    task: str
    evidence: str


class Weights(ApiModel):
    alignment: float = Field(ge=0, le=1)
    validation: float = Field(ge=0, le=1)
    schedule: float = Field(ge=0, le=1)
    waste: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def _non_zero(self) -> Weights:
        if self.alignment + self.validation + self.schedule + self.waste <= 0:
            raise ValueError("重みの合計は 0 より大きくしてください")
        return self


class ModeDefinitionBody(ApiModel):
    name: str = Field(min_length=1, max_length=30)
    description: str = Field(max_length=300)
    labels: ModeLabels
    card_labels: CardLabels
    placeholders: Placeholders
    weights: Weights
    prompt_guidance: str = Field(max_length=4000)


class ModeDefinition(StoredModel, ModeDefinitionBody):
    id: Mode
    updated_at: str | None = None
    updated_by: str | None = None
