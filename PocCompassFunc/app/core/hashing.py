"""Content hashes used to skip re-evaluation (SPEC §4.4)."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def design_hash(goal: str, assumptions: list[dict], criteria: list[dict]) -> str:
    return stable_hash(
        {
            "goal": goal,
            "assumptions": sorted((a["id"], a["text"]) for a in assumptions),
            "criteria": sorted((c["id"], c["text"]) for c in criteria),
        }
    )


def task_content_hash(task: dict) -> str:
    return stable_hash(
        {
            "title": task.get("title", ""),
            "description": task.get("description", ""),
            "status": task.get("status", ""),
            "a": sorted(task.get("linked_assumption_ids") or []),
            "c": sorted(task.get("linked_criterion_ids") or []),
        }
    )
