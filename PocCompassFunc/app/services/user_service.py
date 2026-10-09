"""User master (SPEC §3.7, §14). Admin-only writes; search is open to every signed-in user."""

from __future__ import annotations

from app.config.settings import get_settings
from app.constants.limits import USER_LIST_MAX, USER_SEARCH_DEFAULT
from app.core.clock import utc_now_iso
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.models.common import UserContext
from app.models.user import UserBody, UserCreate, UserDoc, UserRecord, normalize_email
from app.services.access import ensure_admin
from app.services.context import Repos


def _record(doc: dict) -> dict:
    d = UserDoc.model_validate(doc)
    return UserRecord(email=d.email, name=d.name, department=d.department, is_admin=d.email in get_settings().admin_emails,
                      created_at=d.created_at, updated_at=d.updated_at).model_dump(mode="json")


def _match(doc: dict, q: str) -> bool:
    return any(q in (doc.get(k) or "").lower() for k in ("email", "name", "department"))


def search_users(repos: Repos, q: str, limit: int | None) -> list[dict]:
    limit = max(1, min(limit or USER_SEARCH_DEFAULT, USER_LIST_MAX))
    needle = q.strip().lower()
    docs = [d for d in repos.users.list() if not needle or _match(d, needle)]
    docs.sort(key=lambda d: (d["name"], d["email"]))
    return [_record(d) for d in docs[:limit]]


def create_user(repos: Repos, body: UserCreate, user: UserContext) -> dict:
    ensure_admin(user)
    if repos.users.get(body.email):
        raise Conflict(f"{body.email} はすでに登録されています。一覧から検索して編集してください。")
    now = utc_now_iso()
    doc = UserDoc(id=body.email, email=body.email, name=body.name, department=body.department,
                  created_at=now, updated_at=now).model_dump(mode="json")
    return _record(repos.users.save(doc))


def update_user(repos: Repos, email: str, body: UserBody, user: UserContext) -> dict:
    ensure_admin(user)
    doc = _existing(repos, email)
    doc.update(name=body.name, department=body.department, updated_at=utc_now_iso())
    return _record(repos.users.save(doc))


def delete_user(repos: Repos, email: str, user: UserContext) -> None:
    ensure_admin(user)
    _existing(repos, email)
    repos.users.delete(_key(email))


def _key(email: str) -> str:
    try:
        return normalize_email(email)
    except ValueError as e:
        raise ValidationFailed(str(e)) from e


def _existing(repos: Repos, email: str) -> dict:
    doc = repos.users.get(_key(email))
    if not doc:
        raise NotFound("ユーザーが見つかりません。画面を再読み込みしてください。")
    return doc


def lookup(repos: Repos, emails: list[str]) -> dict[str, dict]:
    """email -> stored doc, for the addresses that are in the master."""
    out = {}
    for e in emails:
        doc = repos.users.get(e)
        if doc:
            out[e] = doc
    return out
