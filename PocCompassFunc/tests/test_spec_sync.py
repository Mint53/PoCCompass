"""Harness: fail when docs/SPEC.md and the code disagree on numbers or modes.

If this test fails, decide which side is right, update docs/SPEC.md first, then the code.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.constants import limits
from app.constants.enums import Container, ItemType, Mode, ProcessVariant, RequestAction, RequestKind, Verdict
from app.modes.defaults import DEFAULT_MODES

SPEC = (Path(__file__).resolve().parents[2] / "docs" / "SPEC.md").read_text(encoding="utf-8")
BICEP = (Path(__file__).resolve().parents[2] / "infra" / "modules" / "resources.bicep")


def test_every_mode_has_defaults_and_spec_weights():
    assert set(DEFAULT_MODES) == set(Mode)
    for mode, definition in DEFAULT_MODES.items():
        m = re.search(rf"^\| {mode.value} \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \|$", SPEC, re.M)
        assert m, f"weights row for {mode.value} missing in SPEC §5.3"
        w = definition.weights
        assert [float(x) for x in m.groups()] == [w.alignment, w.validation, w.schedule, w.waste]
        assert abs(w.alignment + w.validation + w.schedule + w.waste - 1.0) < 1e-9


def test_mode_labels_match_spec_table():
    for mode, d in DEFAULT_MODES.items():
        header = re.search(r"^\| スロット \|(.+)$", SPEC, re.M).group(1)
        cols = [c.strip() for c in header.strip("|").split("|")]
        idx = next(i for i, c in enumerate(cols) if f"`{mode.value}`" in c)
        for slot in ("goal", "assumption", "criterion", "deadline", "task", "evidence"):
            row = re.search(rf"^\| {slot} \|(.+)$", SPEC, re.M).group(1)
            cells = [c.strip() for c in row.strip("|").split("|")]
            assert cells[idx] == getattr(d.labels, slot), f"{mode.value}.{slot}"


def test_thresholds_match_spec():
    assert f"最大 **{limits.TASKS_PER_AI_CALL} タスク**" in SPEC
    assert f"最大 {limits.MAX_PARALLEL_AI_CALLS} 並列" in SPEC
    assert f"`elapsed - progress > {limits.DELAY_GAP_THRESHOLD}`" in SPEC
    assert f"× {limits.SCHEDULE_PENALTY}" in SPEC
    assert f"{limits.DELTA_LOOKBACK_DAYS} 日以上前" in SPEC
    assert f"{limits.EVIDENCE_DECISIVE_POINTS} × 決定的" in SPEC
    assert f"{limits.EVIDENCE_INCONCLUSIVE_POINTS} × inconclusive" in SPEC
    assert f"最大 {limits.EXTRACT_MAX_CHARS} 字" in SPEC
    assert f"| {limits.ALIGNED_MIN}〜100 |" in SPEC
    assert f"| {limits.WEAK_MIN}〜{limits.ALIGNED_MIN - 1} |" in SPEC
    assert f"最大 **{limits.COMPASS_MAX_FRAMES}** 枚" in SPEC


def test_verdicts_documented():
    for v in Verdict:
        assert f"`{v.value}`" in SPEC


def test_cosmos_containers_match_bicep():
    text = BICEP.read_text(encoding="utf-8")
    for c in Container:
        assert f"'{c.value}'" in text, f"container {c.value} missing in bicep"


def test_item_types_and_new_enums_documented():
    for t in ItemType:
        assert f"| `{t.value}` |" in SPEC, f"item type {t.value} missing in SPEC §3.2"
    for e in (*RequestKind, *RequestAction, *ProcessVariant):
        assert f"`{e.value}`" in SPEC


def test_process_no_limit_matches_spec():
    assert f"最大 {limits.PROCESS_NO_MAX} 字" in SPEC
