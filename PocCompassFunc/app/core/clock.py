"""Time helpers. All persisted datetimes are UTC ISO8601; business dates are JST (SPEC §5)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds")


def today_jst() -> date:
    return datetime.now(JST).date()
