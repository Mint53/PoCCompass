from __future__ import annotations

from pydantic import Field, field_validator

from app.constants.enums import MemberRole
from app.constants.limits import DEPARTMENT_MAX, USER_NAME_MAX
from app.models.common import ApiModel, StoredModel


def normalize_email(value: str) -> str:
    e = value.strip().lower()
    if not e or "@" not in e or " " in e or e.startswith("@") or e.endswith("@"):
        raise ValueError(f"メールアドレスの形式が正しくありません: {value}")
    return e


class UserBody(ApiModel):
    name: str = Field(min_length=1, max_length=USER_NAME_MAX)
    department: str = Field(default="", max_length=DEPARTMENT_MAX)

    @field_validator("name", "department")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("氏名を入力してください")
        return v


class UserCreate(UserBody):
    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return normalize_email(v)


class UserDoc(StoredModel):
    """Stored document: id == email."""

    id: str
    email: str
    name: str
    department: str = ""
    created_at: str
    updated_at: str


class UserRecord(ApiModel):
    email: str
    name: str
    department: str
    is_admin: bool
    created_at: str
    updated_at: str


class ProjectMember(ApiModel):
    email: str
    name: str
    department: str
    role: MemberRole
