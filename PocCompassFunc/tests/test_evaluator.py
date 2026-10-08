"""SPEC §4.3 normalization of AI output."""

from __future__ import annotations

import pytest

from app.services.alignment_evaluator import normalize_result, normalize_verdict
from app.services.prompts import AliasMap


@pytest.mark.parametrize(
    ("verdict", "score", "expected"),
    [
        ("aligned", 85, "aligned"),
        ("aligned", 69, "weak"),
        ("weak", 70, "aligned"),
        ("weak", 39, "drift"),
        ("weak", 50, "weak"),
        ("drift", 40, "weak"),
        ("drift", 10, "drift"),
        ("unnecessary_candidate", 60, "weak"),
        ("unnecessary_candidate", 59, "unnecessary_candidate"),
        ("nonsense", 80, "weak"),
        ("nonsense", 10, "drift"),
    ],
)
def test_normalize_verdict(verdict, score, expected):
    assert normalize_verdict(verdict, score) == expected


def test_normalize_result_clamps_and_resolves_ids():
    task = {"id": "real-t", "title": "x", "description": "", "status": "todo", "linked_assumption_ids": [],
            "linked_criterion_ids": []}
    tmap, amap, cmap = AliasMap("T", ["real-t"]), AliasMap("A", ["real-a"]), AliasMap("C", [])
    raw = {"task_id": "T1", "alignment_score": 140.4, "verdict": "aligned", "linked_assumption_ids": ["A1", "A9"],
           "linked_criterion_ids": ["C1"], "reason": "r" * 500, "suggested_action": ""}
    out = normalize_result(raw, tmap, amap, cmap, {"real-t": task})
    assert out["task_id"] == "real-t"
    assert out["alignment_score"] == 100
    assert out["linked_assumption_ids"] == ["real-a"]
    assert out["linked_criterion_ids"] == []
    assert len(out["reason"]) == 200


def test_normalize_result_unknown_task_is_dropped():
    assert normalize_result({"task_id": "T7"}, AliasMap("T", ["a"]), AliasMap("A", []), AliasMap("C", []), {}) is None


def test_aliases_in_prose_are_humanized():
    from app.modes.defaults import DEFAULT_MODES

    mode = DEFAULT_MODES["poc"].model_dump(mode="json")
    task = {"id": "t", "title": "x", "description": "", "status": "todo", "linked_assumption_ids": [],
            "linked_criterion_ids": []}
    raw = {"task_id": "T1", "alignment_score": 10, "verdict": "drift", "linked_assumption_ids": [],
           "linked_criterion_ids": [], "reason": "C1/C2 と A2 に無関係", "suggested_action": "C1 に集中"}
    out = normalize_result(raw, AliasMap("T", ["t"]), AliasMap("A", []), AliasMap("C", []), {"t": task}, mode)
    assert out["reason"] == "成功条件1/成功条件2 と 仮説2 に無関係"
    assert out["suggested_action"] == "成功条件1 に集中"
