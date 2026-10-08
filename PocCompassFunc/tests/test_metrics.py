"""Unit tests for SPEC §5 (deterministic metrics). Each test names the spec clause it pins down."""

from __future__ import annotations

from datetime import date

from app.core.hashing import task_content_hash
from app.models.dashboard import HealthComponents
from app.services import metrics

W = {"alignment": 0.40, "validation": 0.25, "schedule": 0.20, "waste": 0.15}
PROJECT = {"id": "p", "goal": "g", "start_date": "2026-01-01", "deadline": "2026-01-11"}


def item(type_: str, id_: str, **f):
    return {"id": id_, "projectId": "p", "type": type_, "created_at": f.pop("created_at", "2026-01-01T00:00:00+00:00"), **f}


def task(id_: str, title: str = "t", status: str = "todo", **f):
    return item("task", id_, title=title, description="", status=status, linked_assumption_ids=[],
                linked_criterion_ids=[], **f)


def result(t: dict, score: int, verdict: str) -> dict:
    return {"task_id": t["id"], "content_hash": task_content_hash(t), "alignment_score": score, "verdict": verdict,
            "linked_assumption_ids": [], "linked_criterion_ids": [], "reason": "r", "suggested_action": ""}


def evaluation(*results: dict) -> dict:
    return {"created_at": "2026-01-05T00:00:00+00:00", "design_hash": "x", "task_results": list(results)}


def test_combine_skips_null_components():  # §5.3
    comps = HealthComponents(alignment=None, validation=50.0, schedule=100.0, waste=None)
    assert metrics.combine(comps, W) == round((0.25 * 50 + 0.20 * 100) / 0.45)


def test_combine_all_null_is_null():  # §5.3
    assert metrics.combine(HealthComponents(alignment=None, validation=None, schedule=None, waste=None), W) is None


def test_alignment_is_effort_weighted_and_dismissed_counts_as_100():  # §5.2
    t1, t2, t3 = task("t1", effort_hours=3), task("t2"), task("t3")
    fb = item("feedback", "f", task_id="t3", content_hash=task_content_hash(t3), judgement="dismiss")
    ev = evaluation(result(t1, 80, "aligned"), result(t2, 20, "drift"), result(t3, 0, "drift"))
    by = metrics.ItemsByType.from_items([t1, t2, t3, fb])
    comps = metrics.health_components(PROJECT, by, metrics.build_task_views(by, ev), date(2026, 1, 1))
    assert comps.alignment == round((80 * 3 + 20 * 1 + 100 * 1) / 5, 1)
    # waste: only t2 (weight 1) of 5 is a problem; dismissed t3 excluded
    assert comps.waste == 80.0


def test_result_with_old_hash_is_ignored():  # §4.5
    t1 = task("t1", title="new title")
    stale = result(task("t1", title="old title"), 10, "drift")
    dash = metrics.compute_dashboard(PROJECT, [t1], evaluation(stale), [], W, date(2026, 1, 1))
    assert dash.cards.drift == 0
    assert dash.stale_task_ids == ["t1"]
    assert dash.health.components.alignment is None


def test_validation_points():  # §5.2
    a1 = item("assumption", "a1", text="x", status="supported", priority="high")
    a2 = item("assumption", "a2", text="y", status="untested", priority="low")
    a3 = item("assumption", "a3", text="z", status="untested", priority="low")
    ev = item("evidence", "e1", assumption_id="a2", summary="s", result="inconclusive")
    by = metrics.ItemsByType.from_items([a1, a2, a3, ev])
    comps = metrics.health_components(PROJECT, by, [], date(2026, 1, 1))
    assert comps.validation == round((100 + 50 + 0) / 3, 1)


def test_schedule_on_track_and_delayed():  # §5.1, §5.2
    c = item("criterion", "c1", text="c", target="", status="not_met")
    t_done = task("t1", status="done")
    t_todo = task("t2")
    by = metrics.ItemsByType.from_items([c, t_done, t_todo])
    # day 2 of 10: elapsed 0.2, progress = 0.5*0 + 0.5*0.5 = 0.25 -> on track
    s = metrics.schedule_state(PROJECT, by, date(2026, 1, 3))
    assert (s.elapsed, s.progress, s.delayed) == (0.2, 0.25, False)
    # day 6: elapsed 0.6, gap 0.35 > 0.15 -> delayed; schedule = 100 - 0.35*200 = 30
    s = metrics.schedule_state(PROJECT, by, date(2026, 1, 7))
    assert s.delayed is True
    comps = metrics.health_components(PROJECT, by, [], date(2026, 1, 7))
    assert comps.schedule == 30.0


def test_past_deadline_with_unmet_criterion_is_zero():  # §5.2
    c = item("criterion", "c1", text="c", target="", status="not_met")
    by = metrics.ItemsByType.from_items([c])
    assert metrics.health_components(PROJECT, by, [], date(2026, 1, 12)).schedule == 0.0


def test_deadline_risk_items():  # §5.1
    c = item("criterion", "c1", text="c", target="", status="not_met")
    overdue = task("t1", title="overdue", due_date="2026-01-02")
    done = task("t2", status="done", due_date="2026-01-02")
    dash = metrics.compute_dashboard(PROJECT, [c, overdue, done], None, [], W, date(2026, 1, 7))
    kinds = sorted(r.kind for r in dash.deadline_risks)
    assert kinds == ["overdue_task", "unmet_criterion"]
    assert dash.cards.deadline_risk == 2


def test_untested_card_and_under_evidenced_order():  # §5.1, §5.5
    a_hi = item("assumption", "a1", text="hi", status="untested", priority="high")
    a_lo = item("assumption", "a2", text="lo", status="untested", priority="low")
    a_ok = item("assumption", "a3", text="ok", status="supported", priority="high")
    a_ev = item("assumption", "a4", text="ev", status="testing", priority="high")
    ev = item("evidence", "e", assumption_id="a4", summary="s", result="supports")
    dash = metrics.compute_dashboard(PROJECT, [a_hi, a_lo, a_ok, a_ev, ev], None, [], W, date(2026, 1, 1))
    assert dash.cards.untested == 2
    assert [u.assumption_id for u in dash.under_evidenced] == ["a1", "a4", "a2"]
    assert dash.under_evidenced[1].shortage == 60


def test_weak_tasks_sorted_and_gap():  # §5.5
    ts = [task(f"t{i}", title=f"task{i}") for i in range(7)]
    ev = evaluation(*[result(t, 10 * i + 5, "aligned" if i > 6 else "weak") for i, t in enumerate(ts)])
    dash = metrics.compute_dashboard(PROJECT, ts, ev, [], W, date(2026, 1, 1))
    assert [w.alignment_score for w in dash.weak_tasks] == [5, 15, 25, 35, 45]
    assert dash.weak_tasks[0].gap == 95


def test_delta_uses_newest_snapshot_older_than_30_days():  # §5.4
    snaps = [{"date": "2025-11-01", "score": 40}, {"date": "2025-12-01", "score": 60}, {"date": "2025-12-20", "score": 99}]
    assert metrics.delta_vs_last_month(70, snaps, date(2026, 1, 1)) == 10
    assert metrics.delta_vs_last_month(70, [], date(2026, 1, 1)) is None
    assert metrics.delta_vs_last_month(None, snaps, date(2026, 1, 1)) is None


def test_verdict_counts_add_up_to_task_count():  # §12.1
    a, b, c, d = task("a"), task("b"), task("c"), task("d")
    ev = evaluation(result(a, 90, "aligned"), result(b, 20, "drift"), result(c, 50, "weak"))
    dash = metrics.compute_dashboard(PROJECT, [a, b, c, d], ev, [], W, date(2026, 1, 5))
    vc = dash.verdict_counts
    assert (vc.aligned, vc.weak, vc.drift, vc.unnecessary, vc.dismissed, vc.pending) == (1, 1, 1, 0, 0, 1)


def test_dismissed_task_is_counted_apart_and_evidence_tally():  # §12.1, §12.2
    a = task("a")
    fb = item("feedback", "f", task_id="a", content_hash=task_content_hash(a), judgement="dismiss")
    as_ = item("assumption", "as1", text="仮説", status="testing", priority="high")
    e1 = item("evidence", "e1", assumption_id="as1", summary="s", result="supports")
    e2 = item("evidence", "e2", assumption_id="as1", summary="s", result="inconclusive")
    dash = metrics.compute_dashboard(PROJECT, [a, fb, as_, e1, e2], evaluation(result(a, 10, "drift")), [], W, date(2026, 1, 5))
    assert dash.verdict_counts.dismissed == 1 and dash.verdict_counts.drift == 0
    t = dash.evidence_tally[0]
    assert (t.supports, t.refutes, t.inconclusive) == (1, 0, 1)
