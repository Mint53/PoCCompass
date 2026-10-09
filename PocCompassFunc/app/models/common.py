from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.constants.enums import UserRole


class ApiModel(BaseModel):
    """Base for every API model. Fields with defaults are still *required* in response schemas,
    so the generated TypeScript types (PocCompassFront/lib/api/schema.d.ts) are not needlessly optional."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class StoredModel(ApiModel):
    """Base for documents read back from storage. Cosmos adds _rid/_etag/... which we drop."""

    model_config = ConfigDict(extra="ignore", json_schema_serialization_defaults_required=True)


class UserContext(ApiModel):
    email: str
    name: str
    department: str = ""
    role: UserRole = UserRole.GENERAL
    is_admin: bool = False


class ErrorBody(ApiModel):
    code: str
    message: str


class ErrorResponse(ApiModel):
    error: ErrorBody
