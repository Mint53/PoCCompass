"""AI chat (SPEC §11)."""

from __future__ import annotations

from typing import Any

from pydantic import Field

from app.constants.enums import ChatRole, OperationKind, OperationTarget, ProposalStatus
from app.models.common import ApiModel, StoredModel


class Operation(ApiModel):
    op: OperationKind
    target: OperationTarget
    item_id: str | None = None
    fields: dict[str, Any] = Field(default_factory=dict)
    summary: str
    error: str | None = None
    result: str | None = None  # ok | failed
    result_message: str | None = None


class Proposal(ApiModel):
    status: ProposalStatus
    operations: list[Operation]


class ChatMessage(StoredModel):
    id: str
    projectId: str  # noqa: N815
    user_email: str
    role: ChatRole
    content: str
    created_at: str
    proposal: Proposal | None = None


class ChatSend(ApiModel):
    message: str = Field(min_length=1)


class ChatSendResponse(ApiModel):
    user_message: ChatMessage
    assistant_message: ChatMessage


class ChatApply(ApiModel):
    operation_indexes: list[int] | None = None
