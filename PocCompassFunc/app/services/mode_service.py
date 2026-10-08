"""Mode definitions: stored in Cosmos, seeded from app/modes/defaults.py when missing (SPEC §2, §3.6)."""

from __future__ import annotations

from app.constants.enums import Mode
from app.core.clock import utc_now_iso
from app.core.errors import NotFound
from app.models.common import UserContext
from app.models.mode import ModeDefinition, ModeDefinitionBody
from app.modes.defaults import DEFAULT_MODES
from app.services.access import ensure_admin
from app.services.context import Repos


def _parse_mode(mode_id: str) -> Mode:
    try:
        return Mode(mode_id)
    except ValueError as e:
        raise NotFound(f"モード「{mode_id}」は存在しません。") from e


def get_mode(repos: Repos, mode_id: str) -> dict:
    mode = _parse_mode(mode_id)
    doc = repos.modes.get(mode.value)
    if doc is None:
        doc = repos.modes.save(DEFAULT_MODES[mode].model_dump(mode="json"))
    return ModeDefinition.model_validate(doc).model_dump(mode="json")


def list_modes(repos: Repos) -> list[dict]:
    return [get_mode(repos, m.value) for m in Mode]


def update_mode(repos: Repos, mode_id: str, body: ModeDefinitionBody, user: UserContext) -> dict:
    ensure_admin(user)
    mode = _parse_mode(mode_id)
    doc = {**body.model_dump(mode="json"), "id": mode.value, "updated_at": utc_now_iso(), "updated_by": user.email}
    repos.modes.save(doc)
    return get_mode(repos, mode.value)


def reset_mode(repos: Repos, mode_id: str, user: UserContext) -> dict:
    ensure_admin(user)
    mode = _parse_mode(mode_id)
    repos.modes.save({**DEFAULT_MODES[mode].model_dump(mode="json"), "updated_at": utc_now_iso(),
                      "updated_by": user.email})
    return get_mode(repos, mode.value)
