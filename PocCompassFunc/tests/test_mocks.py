"""SPEC §18 screen mocks: the AI adds versions, people adopt them; the handoff pack is a human-saved draft."""

from __future__ import annotations

import io
import zipfile

from app.constants.limits import MOCK_HTML_MAX, MOCK_SCREENS_MAX
from tests.conftest import MEMBER, OWNER, STRANGER, make_project

VIEWER = {"x-poccompass-user-email": "viewer@example.com"}


def base(pid: str) -> str:
    return f"/api/projects/{pid}/screens"


def new_screen(client, pid, name="申請一覧", headers=OWNER) -> dict:
    r = client.post(base(pid), json={"name": name, "description": "申請を探して承認する"}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def send(client, pid, sid, text="一覧画面を作って", headers=OWNER, **extra) -> dict:
    r = client.post(f"{base(pid)}/{sid}/messages", json={"message": text, **extra}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_list_and_versions(client, llm):
    pid = make_project(client)["id"]
    client.post(f"/api/projects/{pid}/items", json={"type": "request", "kind": "request", "title": "CSV で出したい"},
                headers=OWNER)
    s = new_screen(client, pid)
    assert s["latest_version_no"] == 0 and s["adopted_version_id"] is None

    r1 = send(client, pid, s["id"])
    assert r1["version"]["no"] == 1 and r1["version"]["summary"] == "初版"
    assert r1["assistant_message"]["version_id"] == r1["version"]["id"]
    prompt = llm.calls[-1]["user"]
    assert "CSV で出したい" in prompt and "問い合わせ一次対応の工数削減" in prompt  # goal and requests reach the AI
    assert "まだ版がありません" in prompt

    llm.mock_reply = {"reply": "直しました。", "html": "<!doctype html><p>v2</p>", "summary": "列を追加"}
    r2 = send(client, pid, s["id"], "承認日の列を足して")
    assert r2["version"]["no"] == 2
    assert "<p>v</p>" in llm.calls[-1]["user"]  # latest version is the base by default
    assert "一覧画面を作って" in llm.calls[-1]["user"]  # hearing history is passed

    # explicit base version
    send(client, pid, s["id"], "v1 から別案", base_version_id=r1["version"]["id"])
    assert "<p>v</p>" in llm.calls[-1]["user"] and "<p>v2</p>" not in llm.calls[-1]["user"]

    detail = client.get(f"{base(pid)}/{s['id']}", headers=OWNER).json()
    assert [v["no"] for v in detail["versions"]] == [1, 2, 3]
    assert "html" not in detail["versions"][0]
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"] * 3
    v = client.get(f"{base(pid)}/{s['id']}/versions/{r2['version']['id']}", headers=OWNER).json()
    assert v["html"] == "<!doctype html><p>v2</p>"
    assert [x["name"] for x in client.get(base(pid), headers=OWNER).json()] == ["申請一覧"]


def test_question_only_and_oversized_html_make_no_version(client, llm):
    pid = make_project(client)["id"]
    s = new_screen(client, pid)
    llm.mock_reply = {"reply": "承認者は誰ですか？", "html": "", "summary": ""}
    assert send(client, pid, s["id"], "どう思う？")["version"] is None
    llm.mock_reply = {"reply": "作りました。", "html": "x" * (MOCK_HTML_MAX + 1), "summary": "大"}
    r = send(client, pid, s["id"])
    assert r["version"] is None and "長すぎる" in r["assistant_message"]["content"]
    assert client.get(f"{base(pid)}/{s['id']}", headers=OWNER).json()["versions"] == []


def test_thread_is_shared_between_members(client, llm):
    pid = make_project(client)["id"]
    s = new_screen(client, pid)
    send(client, pid, s["id"], "オーナーの依頼")
    send(client, pid, s["id"], "メンバーの依頼", headers=MEMBER)
    msgs = client.get(f"{base(pid)}/{s['id']}", headers=OWNER).json()["messages"]
    assert [m["content"] for m in msgs if m["role"] == "user"] == ["オーナーの依頼", "メンバーの依頼"]
    assert msgs[0]["author_name"] == "オーナー"


def test_adopt_rename_and_delete(client, llm):
    pid = make_project(client)["id"]
    s = new_screen(client, pid)
    other = new_screen(client, pid, "別画面")
    v = send(client, pid, s["id"])["version"]
    other_v = send(client, pid, other["id"])["version"]

    r = client.patch(f"{base(pid)}/{s['id']}", json={"adopted_version_id": v["id"], "name": "申請一覧（承認者）"},
                     headers=OWNER)
    assert r.status_code == 200 and r.json()["adopted_version_id"] == v["id"]
    assert r.json()["name"] == "申請一覧（承認者）"
    # another screen's version cannot be adopted
    assert client.patch(f"{base(pid)}/{s['id']}", json={"adopted_version_id": other_v["id"]},
                        headers=OWNER).status_code == 400
    assert client.patch(f"{base(pid)}/{s['id']}", json={"adopted_version_id": ""},
                        headers=OWNER).json()["adopted_version_id"] is None

    assert client.delete(f"{base(pid)}/{s['id']}", headers=OWNER).status_code == 204
    assert client.get(f"{base(pid)}/{s['id']}", headers=OWNER).status_code == 404
    assert client.get(f"{base(pid)}/{s['id']}/versions/{v['id']}", headers=OWNER).status_code == 404
    # the other screen is untouched
    assert len(client.get(f"{base(pid)}/{other['id']}", headers=OWNER).json()["messages"]) == 2


def test_handoff_draft_save_and_export(client, llm):
    pid = make_project(client)["id"]
    s = new_screen(client, pid, "申請/一覧:承認")
    # no version yet
    assert client.post(f"{base(pid)}/{s['id']}/handoff/draft", json={}, headers=OWNER).status_code == 400
    v1 = send(client, pid, s["id"])["version"]
    llm.mock_reply = {"reply": "直しました。", "html": "<!doctype html><p>v2</p>", "summary": "s"}
    send(client, pid, s["id"], "承認ボタンを右に")
    client.patch(f"{base(pid)}/{s['id']}", json={"adopted_version_id": v1["id"]}, headers=OWNER)

    r = client.post(f"{base(pid)}/{s['id']}/handoff/draft", json={"tech_notes": "Next.js + FastAPI"}, headers=OWNER)
    assert r.status_code == 200, r.text
    draft = r.json()
    assert draft["version_id"] == v1["id"]  # adopted version wins over latest
    assert draft["screen_spec"] == "# 仕様"
    assert "Next.js + FastAPI" in draft["agents"] and "未決事項は勝手に決めない" in draft["agents"]
    assert "承認ボタンを右に" in llm.calls[-1]["user"] and "<p>v</p>" in llm.calls[-1]["user"]
    # the draft is not saved
    assert client.get(f"{base(pid)}/{s['id']}", headers=OWNER).json()["screen"]["handoff"] is None
    assert client.get(f"{base(pid)}/{s['id']}/handoff/export", headers=OWNER).status_code == 400

    body = {**draft, "tech_notes": "Next.js + FastAPI", "screen_spec": "# 仕様（人が修正）"}
    r = client.put(f"{base(pid)}/{s['id']}/handoff", json=body, headers=OWNER)
    assert r.status_code == 200 and r.json()["handoff"]["screen_spec"] == "# 仕様（人が修正）"

    r = client.get(f"{base(pid)}/{s['id']}/handoff/export", headers=OWNER)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert sorted(z.namelist()) == ["申請_一覧_承認/ACCEPTANCE.md", "申請_一覧_承認/AGENTS.md",
                                    "申請_一覧_承認/SCREEN_SPEC.md", "申請_一覧_承認/mock.html"]
    assert z.read("申請_一覧_承認/mock.html").decode() == "<!doctype html><p>v</p>"
    assert z.read("申請_一覧_承認/SCREEN_SPEC.md").decode() == "# 仕様（人が修正）"


def test_permissions(client, llm):
    pid = make_project(client, viewers=["viewer@example.com"])["id"]
    s = new_screen(client, pid)
    v = send(client, pid, s["id"])["version"]
    draft = client.post(f"{base(pid)}/{s['id']}/handoff/draft", json={}, headers=OWNER).json()
    client.put(f"{base(pid)}/{s['id']}/handoff", json={**draft, "tech_notes": ""}, headers=OWNER)

    # viewers can read and export
    assert client.get(base(pid), headers=VIEWER).status_code == 200
    assert client.get(f"{base(pid)}/{s['id']}", headers=VIEWER).status_code == 200
    assert client.get(f"{base(pid)}/{s['id']}/versions/{v['id']}", headers=VIEWER).status_code == 200
    assert client.get(f"{base(pid)}/{s['id']}/handoff/export", headers=VIEWER).status_code == 200
    # ...but not change anything
    sid = s["id"]
    for method, path, body in [
        ("post", base(pid), {"name": "x"}),
        ("patch", f"{base(pid)}/{sid}", {"adopted_version_id": v["id"]}),
        ("delete", f"{base(pid)}/{sid}", None),
        ("post", f"{base(pid)}/{sid}/messages", {"message": "x"}),
        ("post", f"{base(pid)}/{sid}/handoff/draft", {}),
        ("put", f"{base(pid)}/{sid}/handoff", {**draft, "tech_notes": ""}),
    ]:
        kwargs = {"headers": VIEWER} if body is None else {"headers": VIEWER, "json": body}
        assert getattr(client, method)(path, **kwargs).status_code == 403, (method, path)
    # strangers do not learn the project exists
    assert client.get(base(pid), headers=STRANGER).status_code == 404
    assert client.get(f"{base(pid)}/{sid}/handoff/export", headers=STRANGER).status_code == 404


def test_limits_and_validation(client, llm):
    pid = make_project(client)["id"]
    assert client.post(base(pid), json={"name": ""}, headers=OWNER).status_code == 400
    assert client.post(base(pid), json={"name": "   "}, headers=OWNER).status_code == 400
    for i in range(MOCK_SCREENS_MAX):
        new_screen(client, pid, f"画面{i}")
    r = client.post(base(pid), json={"name": "もう 1 つ"}, headers=OWNER)
    assert r.status_code == 400 and f"{MOCK_SCREENS_MAX} 個まで" in r.json()["error"]["message"]
    sid = client.get(base(pid), headers=OWNER).json()[0]["id"]
    assert client.post(f"{base(pid)}/{sid}/messages", json={"message": "x" * 4001}, headers=OWNER).status_code == 400
    assert client.post(f"{base(pid)}/{sid}/messages", json={"message": "x", "base_version_id": "nope"},
                       headers=OWNER).status_code == 400
    assert client.get(f"{base(pid)}/nope", headers=OWNER).status_code == 404


def test_ai_failure_returns_502(client, llm):
    pid = make_project(client)["id"]
    s = new_screen(client, pid)
    llm.fail = True
    r = client.post(f"{base(pid)}/{s['id']}/messages", json={"message": "作って"}, headers=OWNER)
    assert r.status_code == 502 and r.json()["error"]["code"] == "AI_FAILED"
