"""End-to-end API behaviour through FastAPI with in-memory storage and a fake LLM."""

from __future__ import annotations

from tests.conftest import ADMIN, MEMBER, OWNER, STRANGER, add_task, make_project


def test_health_and_me(client):
    assert client.get("/api/health").json()["status"] == "ok"
    me = client.get("/api/me", headers=OWNER).json()
    assert me == {"email": "owner@example.com", "name": "オーナー", "is_admin": False}
    assert client.get("/api/me", headers=ADMIN).json()["is_admin"] is True


def test_missing_user_header_is_401(client):
    r = client.get("/api/projects")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_validation_error_envelope(client):
    r = client.post("/api/projects", json={"mode": "poc", "title": "", "goal": "g", "deadline": "x"}, headers=OWNER)
    assert r.status_code == 400
    body = r.json()["error"]
    assert body["code"] == "VALIDATION_ERROR" and body["message"].startswith("入力内容が正しくありません")


def test_deadline_before_start_rejected(client):
    r = client.post("/api/projects", json={"mode": "poc", "title": "t", "goal": "g", "start_date": "2026-05-01",
                                            "deadline": "2026-04-01"}, headers=OWNER)
    assert r.status_code == 400


def test_create_project_seeds_items_and_members(client):
    p = make_project(client)
    assert p["members"] == ["owner@example.com", "member@example.com"]
    items = client.get(f"/api/projects/{p['id']}/items", headers=MEMBER).json()
    assert [a["text"] for a in items["assumptions"]] == ["7 割は定型", "AI で分類できる"]
    assert items["assumptions"][0]["priority"] == "high"
    assert items["criteria"][0]["status"] == "not_met"


def test_access_control(client):
    p = make_project(client)
    assert client.get(f"/api/projects/{p['id']}", headers=STRANGER).status_code == 404
    assert client.get(f"/api/projects/{p['id']}", headers=ADMIN).status_code == 200
    assert client.get("/api/projects", headers=STRANGER).json() == []
    assert client.delete(f"/api/projects/{p['id']}", headers=MEMBER).status_code == 403
    assert client.patch(f"/api/projects/{p['id']}", json={"mode": "planning"}, headers=MEMBER).status_code == 403
    assert client.patch(f"/api/projects/{p['id']}", json={"title": "改題"}, headers=MEMBER).status_code == 200


def test_mode_filter_and_change(client):
    p = make_project(client)
    make_project(client, mode="improvement", title="締め日短縮")
    assert [x["mode"] for x in client.get("/api/projects?mode=improvement", headers=OWNER).json()] == ["improvement"]
    r = client.patch(f"/api/projects/{p['id']}", json={"mode": "planning"}, headers=OWNER)
    assert r.json()["mode"] == "planning"
    # data survives the mode change
    assert len(client.get(f"/api/projects/{p['id']}/items", headers=OWNER).json()["assumptions"]) == 2


def test_soft_delete(client, store):
    p = make_project(client)
    assert client.delete(f"/api/projects/{p['id']}", headers=OWNER).status_code == 204
    assert client.get(f"/api/projects/{p['id']}", headers=OWNER).status_code == 404
    from app.constants.enums import Container

    assert store.get(Container.PROJECTS, p["id"], p["id"])["deleted"] is True


def test_evaluation_dashboard_and_cache(client, llm):
    p = make_project(client)
    pid = p["id"]
    add_task(client, pid, "検証データ300件にラベル付け", effort_hours=10)
    add_task(client, pid, "管理画面のダークモード対応")
    add_task(client, pid, "別件の社内ポータル改修")

    r = client.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    assert r.status_code == 201, r.text
    ev = r.json()
    assert ev["ai_calls"] == 1 and len(ev["task_results"]) == 3
    assert all(set(x["linked_assumption_ids"]) <= {i["id"] for i in client.get(
        f"/api/projects/{pid}/items", headers=OWNER).json()["assumptions"]} for x in ev["task_results"])

    dash = client.get(f"/api/projects/{pid}/dashboard", headers=OWNER).json()
    assert dash["cards"]["drift"] == 1 and dash["cards"]["unnecessary"] == 1
    assert dash["cards"]["untested"] == 2
    assert dash["health"]["score"] is not None
    assert dash["weak_tasks"][0]["title"] == "別件の社内ポータル改修"
    assert len(dash["alerts"]) == 2
    assert client.get("/api/projects", headers=OWNER).json()[0]["summary"]["drift"] == 1

    # second run: nothing changed -> no AI call, results reused
    ev2 = client.post(f"/api/projects/{pid}/evaluations", headers=OWNER).json()
    assert ev2["ai_calls"] == 0 and all(x["reused"] for x in ev2["task_results"])

    # change one task -> only that one is re-evaluated
    t = dash["alerts"][0]
    client.patch(f"/api/projects/{pid}/items/{t['task_id']}", json={"description": "追記"}, headers=OWNER)
    stale = client.get(f"/api/projects/{pid}/dashboard", headers=OWNER).json()
    assert stale["stale_task_ids"] == [t["task_id"]]
    ev3 = client.post(f"/api/projects/{pid}/evaluations", headers=OWNER).json()
    assert ev3["ai_calls"] == 1 and sum(not x["reused"] for x in ev3["task_results"]) == 1

    # change the design -> everything re-evaluated
    client.patch(f"/api/projects/{pid}", json={"goal": "新しい目的"}, headers=OWNER)
    assert client.get(f"/api/projects/{pid}/dashboard", headers=OWNER).json()["design_changed"] is True
    ev4 = client.post(f"/api/projects/{pid}/evaluations", headers=OWNER).json()
    assert not any(x["reused"] for x in ev4["task_results"])


def test_feedback_dismiss_removes_alert_until_task_changes(client):
    pid = make_project(client)["id"]
    t = add_task(client, pid, "管理画面のダークモード対応")
    client.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    r = client.post(f"/api/projects/{pid}/feedback", json={"task_id": t["id"], "judgement": "dismiss"}, headers=MEMBER)
    assert r.status_code == 201
    dash = client.get(f"/api/projects/{pid}/dashboard", headers=OWNER).json()
    assert dash["cards"]["unnecessary"] == 0 and dash["alerts"] == []
    client.patch(f"/api/projects/{pid}/items/{t['id']}", json={"title": "管理画面のダークモード対応（再）"}, headers=OWNER)
    client.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    assert client.get(f"/api/projects/{pid}/dashboard", headers=OWNER).json()["cards"]["unnecessary"] == 1


def test_item_patch_rules(client):
    pid = make_project(client)["id"]
    t = add_task(client, pid, "作業", effort_hours=2, due_date="2026-10-01")
    r = client.patch(f"/api/projects/{pid}/items/{t['id']}", json={"text": "x"}, headers=OWNER)
    assert r.status_code == 400  # text is not a task field
    r = client.patch(f"/api/projects/{pid}/items/{t['id']}", json={"status": "bogus"}, headers=OWNER)
    assert r.status_code == 400
    r = client.patch(f"/api/projects/{pid}/items/{t['id']}", json={"status": "done", "clear_due_date": True}, headers=OWNER)
    assert r.json()["status"] == "done" and r.json()["due_date"] is None and r.json()["effort_hours"] == 2


def test_task_links_must_exist(client):
    pid = make_project(client)["id"]
    r = client.post(f"/api/projects/{pid}/items", json={"type": "task", "title": "x", "linked_assumption_ids": ["nope"]},
                    headers=OWNER)
    assert r.status_code == 400


def test_delete_assumption_cascades(client):
    pid = make_project(client)["id"]
    items = client.get(f"/api/projects/{pid}/items", headers=OWNER).json()
    a_id = items["assumptions"][0]["id"]
    t = add_task(client, pid, "作業", linked_assumption_ids=[a_id])
    client.post(f"/api/projects/{pid}/items", json={"type": "evidence", "assumption_id": a_id, "summary": "s",
                                                    "result": "supports"}, headers=OWNER)
    assert client.delete(f"/api/projects/{pid}/items/{a_id}", headers=OWNER).status_code == 204
    after = client.get(f"/api/projects/{pid}/items", headers=OWNER).json()
    assert after["evidence"] == []
    assert [x for x in after["tasks"] if x["id"] == t["id"]][0]["linked_assumption_ids"] == []


def test_decision_stop_sets_status(client):
    pid = make_project(client)["id"]
    r = client.post(f"/api/projects/{pid}/items", json={"type": "decision", "decision": "stop", "note": "撤退"}, headers=OWNER)
    assert r.status_code == 201
    assert client.get(f"/api/projects/{pid}", headers=OWNER).json()["status"] == "stopped"
    client.post(f"/api/projects/{pid}/items", json={"type": "decision", "decision": "continue"}, headers=OWNER)
    assert client.get(f"/api/projects/{pid}", headers=OWNER).json()["status"] == "active"


def test_report_options_fixed_order(client):
    pid = make_project(client)["id"]
    r = client.post(f"/api/projects/{pid}/reports", headers=OWNER)
    assert r.status_code == 201, r.text
    assert [o["decision"] for o in r.json()["content"]["options"]] == ["continue", "pivot", "stop"]
    assert len(client.get(f"/api/projects/{pid}/reports", headers=OWNER).json()) == 1


def test_extract_resolves_aliases_and_drops_blank(client):
    pid = make_project(client)["id"]
    r = client.post(f"/api/projects/{pid}/tasks/extract", json={"text": "今週はヒアリングした"}, headers=OWNER)
    assert r.status_code == 200, r.text
    tasks = r.json()["tasks"]
    assert len(tasks) == 1 and len(tasks[0]["linked_assumption_ids"]) == 1 and tasks[0]["linked_criterion_ids"] == []
    r = client.post(f"/api/projects/{pid}/items/bulk", json={"tasks": tasks}, headers=OWNER)
    assert r.status_code == 201 and r.json()[0]["type"] == "task"


def test_extract_too_long(client):
    pid = make_project(client)["id"]
    r = client.post(f"/api/projects/{pid}/tasks/extract", json={"text": "あ" * 8001}, headers=OWNER)
    assert r.status_code == 400


def test_ai_failure_is_502(client, llm):
    pid = make_project(client)["id"]
    add_task(client, pid, "作業")
    llm.fail = True
    r = client.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    assert r.status_code == 502 and r.json()["error"]["code"] == "AI_FAILED"


def test_ai_not_configured_is_503(client, monkeypatch):
    from fastapi.testclient import TestClient

    from app.api import create_app
    from app.controllers import deps

    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "")
    from app.config.settings import get_settings
    from app.services.llm_client import get_llm

    get_settings.cache_clear()
    get_llm.cache_clear()
    app = create_app()
    app.dependency_overrides[deps.get_repos] = client.app.dependency_overrides[deps.get_repos]
    c = TestClient(app, raise_server_exceptions=False)
    pid = make_project(c)["id"]
    r = c.post(f"/api/projects/{pid}/evaluations", headers=OWNER)
    assert r.status_code == 503 and r.json()["error"]["code"] == "AI_NOT_CONFIGURED"


def test_on_azure_dev_user_fallback_disabled(client, monkeypatch):
    from app.config.settings import get_settings

    monkeypatch.setenv("DEV_USER_EMAIL", "dev@example.com")
    monkeypatch.setenv("WEBSITE_INSTANCE_ID", "abc")
    get_settings.cache_clear()
    assert client.get("/api/me").status_code == 401
    monkeypatch.delenv("WEBSITE_INSTANCE_ID")
    get_settings.cache_clear()
    assert client.get("/api/me").json()["email"] == "dev@example.com"


def test_modes_admin_only(client):
    modes = client.get("/api/modes", headers=OWNER).json()
    assert [m["id"] for m in modes] == ["poc", "planning", "improvement"]
    body = {k: modes[0][k] for k in ("name", "description", "labels", "card_labels", "placeholders", "weights",
                                     "prompt_guidance")}
    body["labels"]["assumption"] = "検証仮説"
    assert client.put("/api/modes/poc", json=body, headers=OWNER).status_code == 403
    r = client.put("/api/modes/poc", json=body, headers=ADMIN)
    assert r.status_code == 200 and r.json()["labels"]["assumption"] == "検証仮説"
    assert client.post("/api/modes/poc/reset", headers=ADMIN).json()["labels"]["assumption"] == "仮説"
    assert client.get("/api/modes/unknown", headers=OWNER).status_code == 404


def test_scheduled_run_skips_stopped_and_survives_failure(repos, llm, client):
    from app.services.evaluation_service import run_scheduled

    p1 = make_project(client)
    p2 = make_project(client, title="止めた")
    add_task(client, p1["id"], "作業")
    client.post(f"/api/projects/{p2['id']}/items", json={"type": "decision", "decision": "stop"}, headers=OWNER)
    assert run_scheduled(repos, lambda: llm) == {"ok": 1, "failed": 0}
    llm.fail = True
    client.patch(f"/api/projects/{p1['id']}", json={"goal": "変更"}, headers=OWNER)
    assert run_scheduled(repos, lambda: llm) == {"ok": 0, "failed": 1}
