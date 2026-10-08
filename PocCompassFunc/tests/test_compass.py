"""Compass view (SPEC §13): deterministic projection of evaluations, feedback and the dashboard."""

from __future__ import annotations

from app.constants.limits import COMPASS_MAX_FRAMES
from tests.conftest import MEMBER, OWNER, STRANGER, add_task, make_project


def _compass(client, pid):
    r = client.get(f"/api/projects/{pid}/compass", headers=OWNER)
    assert r.status_code == 200, r.text
    return r.json()


def _setup(client):
    pid = make_project(client)["id"]
    ids = {
        "ok": add_task(client, pid, "検証データ300件にラベル付け")["id"],
        "unn": add_task(client, pid, "管理画面のダークモード対応")["id"],
        "drift": add_task(client, pid, "別件の社内ポータル改修")["id"],
    }
    return pid, ids


def test_before_any_evaluation_only_the_current_frame_exists(client):
    pid, _ = _setup(client)
    c = _compass(client, pid)
    assert [f["is_current"] for f in c["frames"]] == [True]
    assert c["attention_count"] == 0
    assert all(t["points"] == [None] and not t["needs_attention"] for t in c["tasks"])
    assert [s["text"] for s in c["sectors"]] == ["7 割は定型", "AI で分類できる"]


def test_attention_count_matches_dashboard_cards(client):
    pid, ids = _setup(client)
    second = _compass(client, pid)["sectors"][1]["id"]
    client.patch(f"/api/projects/{pid}/items/{ids['ok']}", json={"linked_assumption_ids": [second]}, headers=OWNER)
    client.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    c = _compass(client, pid)
    cards = client.get(f"/api/projects/{pid}/dashboard", headers=OWNER).json()["cards"]
    assert c["attention_count"] == cards["drift"] + cards["unnecessary"] == 2
    by_id = {t["task_id"]: t for t in c["tasks"]}
    assert by_id[ids["ok"]]["needs_attention"] is False and by_id[ids["ok"]]["points"][-1]["verdict"] == "aligned"
    assert by_id[ids["drift"]]["points"][-1] == {"score": 10, "verdict": "drift"}
    assert by_id[ids["drift"]]["reason"] and by_id[ids["drift"]]["suggested_action"]
    # sectors follow the human-made links only (SPEC §12.2): the other tasks have none
    assert by_id[ids["ok"]]["sector_id"] == c["sectors"][1]["id"]
    assert by_id[ids["drift"]]["sector_id"] is None and by_id[ids["unn"]]["sector_id"] is None
    assert len(c["frames"]) == 2 and [f["is_current"] for f in c["frames"]] == [False, True]
    assert c["health_score"] is not None


def test_agree_keeps_attention_dismiss_clears_it(client):
    pid, ids = _setup(client)
    client.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    client.post(f"/api/projects/{pid}/feedback", json={"task_id": ids["drift"], "judgement": "agree"}, headers=MEMBER)
    client.post(f"/api/projects/{pid}/feedback", json={"task_id": ids["unn"], "judgement": "dismiss"}, headers=MEMBER)
    c = _compass(client, pid)
    by_id = {t["task_id"]: t for t in c["tasks"]}
    assert by_id[ids["drift"]]["needs_attention"] is True and by_id[ids["drift"]]["feedback"] == "agree"
    assert by_id[ids["unn"]]["needs_attention"] is False and by_id[ids["unn"]]["feedback"] == "dismiss"
    assert c["attention_count"] == 1


def test_changed_task_is_pending_now_but_keeps_its_history(client):
    pid, ids = _setup(client)
    client.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    client.patch(f"/api/projects/{pid}/items/{ids['drift']}", json={"description": "追記"}, headers=OWNER)
    t = next(x for x in _compass(client, pid)["tasks"] if x["task_id"] == ids["drift"])
    assert t["points"][0] is not None and t["points"][-1] is None
    assert t["needs_attention"] is False and t["feedback"] is None


def test_frames_are_capped_and_ordered_oldest_first(client):
    pid, _ = _setup(client)
    for _ in range(COMPASS_MAX_FRAMES + 3):
        client.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    c = _compass(client, pid)
    assert len(c["frames"]) == COMPASS_MAX_FRAMES
    assert all(len(t["points"]) == COMPASS_MAX_FRAMES for t in c["tasks"])
    assert [f["is_current"] for f in c["frames"]] == [False] * (COMPASS_MAX_FRAMES - 1) + [True]


def test_non_member_gets_404(client):
    pid, _ = _setup(client)
    assert client.get(f"/api/projects/{pid}/compass", headers=STRANGER).status_code == 404
