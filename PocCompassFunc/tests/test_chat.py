"""SPEC §11 AI chat: the AI proposes, a person applies."""

from __future__ import annotations

from tests.conftest import MEMBER, OWNER, add_task, make_project

NULL_FIELDS = {k: None for k in ("title", "description", "text", "status", "priority", "target_value", "effort_hours",
                                 "due_date", "linked_assumption_refs", "linked_criterion_refs", "assumption_ref",
                                 "summary", "result", "source", "goal", "start_date", "deadline")}


def op(op_: str, target: str, ref: str = "", **fields):
    return {"op": op_, "target": target, "ref": ref, "fields": {**NULL_FIELDS, **fields}, "reason": "r"}


def send(client, pid, text="x", headers=OWNER):
    r = client.post(f"/api/projects/{pid}/chat", json={"message": text}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["assistant_message"]


def test_question_without_operations(client, llm):
    pid = make_project(client)["id"]
    llm.chat_reply = {"reply": "T1 の進み具合は順調です。", "operations": []}
    msg = send(client, pid, "状況は？")
    assert msg["proposal"] is None
    assert msg["content"] == "タスク1 の進み具合は順調です。"  # alias humanized
    assert "## 取り組みの現在の内容" in llm.calls[-1]["user"]
    assert len(client.get(f"/api/projects/{pid}/chat", headers=OWNER).json()) == 2
    assert client.get(f"/api/projects/{pid}/chat", headers=MEMBER).json() == []  # per-user thread


def test_proposal_then_apply(client, llm):
    pid = make_project(client)["id"]
    t = add_task(client, pid, "管理画面のダークモード対応")
    llm.chat_reply = {"reply": "提案します。", "operations": [
        op("create", "task", title="検証セットのラベル付け", status="doing", linked_assumption_refs=["A1"]),
        op("update", "task", "T1", status="done"),
        op("update", "assumption", "A2", status="supported"),
        op("create", "evidence", assumption_ref="A1", summary="300 件中 210 件が定型", result="supports"),
        op("update", "project", deadline="2027-01-31"),
        op("update", "task", "T9", status="done"),  # unknown ref -> error
        op("create", "task", title="x", linked_criterion_refs=["C7"]),  # unknown link -> error
        op("delete", "criterion", "C1"),
    ]}
    msg = send(client, pid, "まとめて更新して")
    ops = msg["proposal"]["operations"]
    assert msg["proposal"]["status"] == "pending"
    assert [o["error"] is None for o in ops] == [True, True, True, True, True, False, False, True]
    assert ops[0]["summary"].startswith("タスクを追加: 「検証セットのラベル付け」")
    assert "状態 → 完了" in ops[1]["summary"]
    # nothing is written before apply
    items = client.get(f"/api/projects/{pid}/items", headers=OWNER).json()
    assert len(items["tasks"]) == 1 and items["tasks"][0]["status"] == "todo"

    r = client.post(f"/api/projects/{pid}/chat/{msg['id']}/apply", json={}, headers=OWNER)
    assert r.status_code == 200, r.text
    assert r.json()["proposal"]["status"] == "applied"
    items = client.get(f"/api/projects/{pid}/items", headers=OWNER).json()
    assert {x["title"] for x in items["tasks"]} == {"管理画面のダークモード対応", "検証セットのラベル付け"}
    assert [x for x in items["tasks"] if x["id"] == t["id"]][0]["status"] == "done"
    assert items["assumptions"][1]["status"] == "supported"
    assert len(items["evidence"]) == 1 and items["criteria"] == []
    assert client.get(f"/api/projects/{pid}", headers=OWNER).json()["deadline"] == "2027-01-31"
    # cannot apply twice
    assert client.post(f"/api/projects/{pid}/chat/{msg['id']}/apply", json={}, headers=OWNER).status_code == 400


def test_partial_apply_and_discard(client, llm):
    pid = make_project(client)["id"]
    llm.chat_reply = {"reply": "2 件提案", "operations": [op("create", "task", title="A"), op("create", "task", title="B")]}
    m1 = send(client, pid)
    r = client.post(f"/api/projects/{pid}/chat/{m1['id']}/apply", json={"operation_indexes": [1]}, headers=OWNER)
    assert r.json()["proposal"]["status"] == "partially_applied"
    assert [x["title"] for x in client.get(f"/api/projects/{pid}/items", headers=OWNER).json()["tasks"]] == ["B"]
    m2 = send(client, pid)
    r = client.post(f"/api/projects/{pid}/chat/{m2['id']}/discard", headers=OWNER)
    assert r.json()["proposal"]["status"] == "discarded"
    m3 = send(client, pid)
    # another member cannot touch my proposal
    assert client.post(f"/api/projects/{pid}/chat/{m3['id']}/apply", json={}, headers=MEMBER).status_code == 404


def test_apply_reports_failure_when_target_changed(client, llm):
    pid = make_project(client)["id"]
    t = add_task(client, pid, "作業")
    llm.chat_reply = {"reply": "完了にします", "operations": [op("update", "task", "T1", status="done")]}
    m = send(client, pid)
    client.delete(f"/api/projects/{pid}/items/{t['id']}", headers=OWNER)
    r = client.post(f"/api/projects/{pid}/chat/{m['id']}/apply", json={}, headers=OWNER).json()
    assert r["proposal"]["status"] == "partially_applied"
    assert r["proposal"]["operations"][0]["result"] == "failed"


def test_project_level_restrictions(client, llm):
    pid = make_project(client)["id"]
    llm.chat_reply = {"reply": "x", "operations": [op("delete", "project"), op("update", "project", deadline="2020-01-01")]}
    ops = send(client, pid)["proposal"]["operations"]
    assert all(o["error"] for o in ops)


def test_message_validation_and_clear(client, llm):
    pid = make_project(client)["id"]
    assert client.post(f"/api/projects/{pid}/chat", json={"message": "あ" * 4001}, headers=OWNER).status_code == 400
    send(client, pid, "こんにちは")
    assert client.delete(f"/api/projects/{pid}/chat", headers=OWNER).status_code == 204
    assert client.get(f"/api/projects/{pid}/chat", headers=OWNER).json() == []
