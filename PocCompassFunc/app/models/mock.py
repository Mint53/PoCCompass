"""Screen mocks, hearing thread and handoff pack (SPEC §18)."""

from __future__ import annotations

from pydantic import Field

from app.constants.enums import ChatRole
from app.constants.limits import HANDOFF_DOC_MAX, MOCK_MESSAGE_MAX, TECH_NOTES_MAX, TEXT_MAX, TITLE_MAX
from app.models.common import ApiModel, StoredModel


class Handoff(ApiModel):
    version_id: str
    tech_notes: str = ""
    screen_spec: str
    acceptance: str
    agents: str
    updated_at: str
    updated_by: str


class Screen(StoredModel):
    id: str
    projectId: str  # noqa: N815
    name: str
    description: str = ""
    adopted_version_id: str | None = None
    latest_version_no: int = 0
    handoff: Handoff | None = None
    created_by: str
    created_at: str
    updated_at: str


class ScreenVersionMeta(StoredModel):
    id: str
    screen_id: str
    no: int
    summary: str = ""
    message_id: str | None = None
    created_by: str
    created_at: str


class ScreenVersion(ScreenVersionMeta):
    html: str


class ScreenMessage(StoredModel):
    id: str
    screen_id: str
    role: ChatRole
    content: str
    author_name: str = ""
    version_id: str | None = None
    created_by: str
    created_at: str


class ScreenDetail(ApiModel):
    screen: Screen
    versions: list[ScreenVersionMeta]
    messages: list[ScreenMessage]


class ScreenCreate(ApiModel):
    name: str = Field(min_length=1, max_length=TITLE_MAX)
    description: str = Field(default="", max_length=TEXT_MAX)


class ScreenPatch(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=TITLE_MAX)
    description: str | None = Field(default=None, max_length=TEXT_MAX)
    adopted_version_id: str | None = None  # "" = clear


class ScreenSend(ApiModel):
    message: str = Field(min_length=1, max_length=MOCK_MESSAGE_MAX)
    base_version_id: str | None = None


class ScreenSendResponse(ApiModel):
    user_message: ScreenMessage
    assistant_message: ScreenMessage
    version: ScreenVersionMeta | None = None


class HandoffDraftRequest(ApiModel):
    version_id: str | None = None
    tech_notes: str = Field(default="", max_length=TECH_NOTES_MAX)


class HandoffDraft(ApiModel):
    version_id: str
    screen_spec: str
    acceptance: str
    agents: str


class HandoffSave(ApiModel):
    version_id: str
    tech_notes: str = Field(default="", max_length=TECH_NOTES_MAX)
    screen_spec: str = Field(min_length=1, max_length=HANDOFF_DOC_MAX)
    acceptance: str = Field(min_length=1, max_length=HANDOFF_DOC_MAX)
    agents: str = Field(min_length=1, max_length=HANDOFF_DOC_MAX)
