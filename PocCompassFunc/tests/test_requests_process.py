"""SPEC §3.2 / §14: requests (要望・課題) and process steps (AsIs / ToBe 業務)."""

from __future__ import annotations

from tests.conftest import MEMBER, OWNER, STRANGER, make_project


def _post(client, pid, body, headers=OWNER):
    return client.post(f"/api/projects/{pid}/items", json=body, headers=headers)


def _items(client, pid):
    return client.get(f"/api/projects/{pid}/items", headers=OWNER).json()


def _step(client, pid, no, variant="asis", **fields):
    r = _post(client, pid, {"type": "process_step", "variant": variant, "no": no, "content": f"業務{no}", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def test_request_defaults_and_decision(client):
    pid = make_project(client)["id"]
    r = _post(client, pid, {"type": "request", "kind": "issue", "title": "  月次集計が遅い ", "requester": "経理"})
    assert r.status_code == 201
    req = r.json()
    assert req["title"] == "月次集計が遅い" and req["action"] == "undecided" and req["priority"] == "medium"

    r = client.patch(f"/api/projects/{pid}/items/{req['id']}", json={"action": "needed", "action_reason": "締め日に影響"},
                     headers=MEMBER)
    assert r.status_code == 200 and r.json()["action"] == "needed" and r.json()["action_reason"] == "締め日に影響"
    assert _items(client, pid)["requests"][0]["action"] == "needed"


def test_request_validation_and_access(client):
    pid = make_project(client)["id"]
    assert _post(client, pid, {"type": "request", "title": "  "}).status_code == 400
    assert _post(client, pid, {"type": "request", "title": "x", "action": "maybe"}).status_code == 400
    assert _post(client, pid, {"type": "request", "title": "x"}, STRANGER).status_code == 404


def test_request_does_not_affect_dashboard(client):
    pid = make_project(client)["id"]
    before = client.get(f"/api/projects/{pid}/dashboard", headers=OWNER).json()
    _post(client, pid, {"type": "request", "title": "要望"})
    _step(client, pid, "1")
    assert client.get(f"/api/projects/{pid}/dashboard", headers=OWNER).json() == before


def test_process_step_crud_and_trim(client):
    pid = make_project(client)["id"]
    s = _step(client, pid, " 1 ", assignee=" 営業 ", next_nos=["2", " 2 ", "", "3"])
    assert s["no"] == "1" and s["assignee"] == "営業" and s["next_nos"] == ["2", "3"]
    r = client.patch(f"/api/projects/{pid}/items/{s['id']}", json={"content": "見積作成", "next_nos": []}, headers=OWNER)
    assert r.status_code == 200 and r.json()["content"] == "見積作成" and r.json()["next_nos"] == []
    assert len(_items(client, pid)["process_steps"]) == 1
    assert client.delete(f"/api/projects/{pid}/items/{s['id']}", headers=OWNER).status_code == 204
    assert _items(client, pid)["process_steps"] == []


def test_process_no_unique_per_variant(client):
    pid = make_project(client)["id"]
    a = _step(client, pid, "1")
    assert _post(client, pid, {"type": "process_step", "variant": "asis", "no": "1", "content": "dup"}).status_code == 400
    _step(client, pid, "1", variant="tobe")  # same No in the other variant is fine
    b = _step(client, pid, "2")
    r = client.patch(f"/api/projects/{pid}/items/{b['id']}", json={"no": "1"}, headers=OWNER)
    assert r.status_code == 400
    # saving a step with its own No is not a duplicate
    assert client.patch(f"/api/projects/{pid}/items/{a['id']}", json={"assignee": "経理"}, headers=OWNER).status_code == 200


def test_process_step_validation(client):
    pid = make_project(client)["id"]
    assert _post(client, pid, {"type": "process_step", "variant": "now", "no": "1", "content": "x"}).status_code == 400
    assert _post(client, pid, {"type": "process_step", "variant": "asis", "no": " ", "content": "x"}).status_code == 400
    assert _post(client, pid, {"type": "process_step", "variant": "asis", "no": "1", "content": " "}).status_code == 400
    too_long = _post(client, pid, {"type": "process_step", "variant": "asis", "no": "1" * 21, "content": "x"})
    assert too_long.status_code == 400


def test_process_next_nos_follow_rename_and_delete(client):
    pid = make_project(client)["id"]
    s1 = _step(client, pid, "1", next_nos=["2", "3"])
    s2 = _step(client, pid, "2")
    s3 = _step(client, pid, "3")
    tobe = _step(client, pid, "2", variant="tobe")
    other = _step(client, pid, "1", variant="tobe", next_nos=["2"])

    assert client.patch(f"/api/projects/{pid}/items/{s2['id']}", json={"no": "2a"}, headers=OWNER).status_code == 200
    steps = {s["id"]: s for s in _items(client, pid)["process_steps"]}
    assert steps[s1["id"]]["next_nos"] == ["2a", "3"]
    assert steps[other["id"]]["next_nos"] == ["2"]  # other variant untouched

    client.delete(f"/api/projects/{pid}/items/{s3['id']}", headers=OWNER)
    steps = {s["id"]: s for s in _items(client, pid)["process_steps"]}
    assert steps[s1["id"]]["next_nos"] == ["2a"]
    assert tobe["id"] in steps


def test_viewer_can_read_but_not_write(client):
    viewer = {"x-poccompass-user-email": "viewer@example.com"}
    pid = make_project(client, viewers=["viewer@example.com"])["id"]
    req = _post(client, pid, {"type": "request", "title": "要望"}).json()
    assert _post(client, pid, {"type": "request", "title": "x"}, viewer).status_code == 403
    assert client.patch(f"/api/projects/{pid}/items/{req['id']}", json={"action": "needed"}, headers=viewer).status_code == 403
    assert len(client.get(f"/api/projects/{pid}/items", headers=viewer).json()["requests"]) == 1


def test_samples_create_one_filled_project_per_mode(client):
    r = client.post("/api/projects/samples", headers=OWNER)
    assert r.status_code == 201
    projects = r.json()
    assert [p["mode"] for p in projects] == ["poc", "planning", "improvement"]
    for p in projects:
        assert p["title"].startswith("【サンプル】") and p["owner_email"] == "owner@example.com"
        items = _items(client, p["id"])
        assert len(items["assumptions"]) == 3 and len(items["criteria"]) == 2
        assert len(items["tasks"]) >= 5 and len(items["evidence"]) == 2 and len(items["requests"]) == 3
        assert {s["variant"] for s in items["process_steps"]} == {"asis", "tobe"}
        assert any(t["linked_assumption_ids"] for t in items["tasks"])
        assert {r["action"] for r in items["requests"]} >= {"needed", "not_needed"}
        assert client.get(f"/api/projects/{p['id']}/dashboard", headers=OWNER).status_code == 200
    assert client.post("/api/projects/samples").status_code == 401
