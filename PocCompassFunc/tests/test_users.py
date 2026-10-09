"""User master (SPEC 3.7 / 14) and viewer vs editor permissions (SPEC 9)."""

from __future__ import annotations

from tests.conftest import ADMIN, MEMBER, OWNER, STRANGER, add_task, make_project, register_users

VIEWER = {"x-poccompass-user-email": "viewer@example.com"}


def _user(email: str, name: str, department: str = "") -> dict:
    return {"email": email, "name": name, "department": department}


# ---------------- user master ----------------

def test_admin_can_create_update_delete_and_others_cannot(client):
    assert client.post("/api/users", json=_user("A@Example.com", "山田 太郎", "営業"), headers=OWNER).status_code == 403
    r = client.post("/api/users", json=_user("A@Example.com", "山田 太郎", "営業"), headers=ADMIN)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "a@example.com" and body["department"] == "営業" and body["is_admin"] is False

    assert client.put("/api/users/a@example.com", json={"name": "山田 次郎", "department": ""}, headers=OWNER).status_code == 403
    r = client.put("/api/users/A@example.com", json={"name": "山田 次郎", "department": "開発"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["name"] == "山田 次郎" and r.json()["department"] == "開発"

    assert client.delete("/api/users/a@example.com", headers=OWNER).status_code == 403
    assert client.delete("/api/users/a@example.com", headers=ADMIN).status_code == 204
    assert client.delete("/api/users/a@example.com", headers=ADMIN).status_code == 404
    assert client.put("/api/users/a@example.com", json={"name": "x", "department": ""}, headers=ADMIN).status_code == 404


def test_duplicate_email_is_409_and_bad_input_is_400(client):
    assert client.post("/api/users", json=_user("a@example.com", "A"), headers=ADMIN).status_code == 201
    r = client.post("/api/users", json=_user("A@EXAMPLE.COM", "B"), headers=ADMIN)
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    assert client.post("/api/users", json=_user("not-an-email", "B"), headers=ADMIN).status_code == 400
    assert client.post("/api/users", json=_user("b@example.com", "   "), headers=ADMIN).status_code == 400
    assert client.post("/api/users", json=_user("b@example.com", "x" * 51), headers=ADMIN).status_code == 400


def test_admin_flag_is_derived_from_env_not_stored(client):
    client.post("/api/users", json=_user("admin@example.com", "管理者"), headers=ADMIN)
    rows = client.get("/api/users", headers=OWNER).json()
    assert [r["is_admin"] for r in rows if r["email"] == "admin@example.com"] == [True]


def test_search_matches_email_name_department_case_insensitively_and_orders_by_name(client):
    for e, n, d in [("c@example.com", "佐藤", "営業部"), ("a@example.com", "Alice Smith", "開発部"), ("b@example.com", "伊藤", "開発部")]:
        client.post("/api/users", json=_user(e, n, d), headers=ADMIN)
    names = lambda q: [r["name"] for r in client.get("/api/users", params={"q": q}, headers=STRANGER).json()]  # noqa: E731
    assert names("") == sorted(["佐藤", "Alice Smith", "伊藤"])
    assert names("ALICE") == ["Alice Smith"]
    assert names("開発") == sorted(["Alice Smith", "伊藤"])
    assert names("c@example") == ["佐藤"]
    assert names("該当なし") == []


def test_search_limit_defaults_to_20_and_is_capped(client):
    for i in range(25):
        client.post("/api/users", json=_user(f"u{i:02d}@example.com", f"ユーザー{i:02d}"), headers=ADMIN)
    assert len(client.get("/api/users", headers=OWNER).json()) == 20
    assert len(client.get("/api/users", params={"limit": 5}, headers=OWNER).json()) == 5
    assert len(client.get("/api/users", params={"limit": 500}, headers=OWNER).json()) == 25
    assert client.get("/api/users", params={"limit": 0}, headers=OWNER).status_code == 400


# ---------------- members must come from the master ----------------

def test_unregistered_user_cannot_be_added_as_member_or_viewer(client):
    r = client.post("/api/projects", json={"mode": "poc", "title": "t", "goal": "g", "deadline": "2026-12-31",
                                           "members": ["ghost@example.com"]}, headers=OWNER)
    assert r.status_code == 400 and "ghost@example.com" in r.json()["error"]["message"]
    p = make_project(client)
    r = client.patch(f"/api/projects/{p['id']}", json={"viewers": ["ghost@example.com"]}, headers=OWNER)
    assert r.status_code == 400


def test_existing_members_are_not_rechecked_after_master_deletion(client):
    p = make_project(client)
    assert client.delete("/api/users/member@example.com", headers=ADMIN).status_code == 204
    r = client.patch(f"/api/projects/{p['id']}", json={"members": ["owner@example.com", "member@example.com"]}, headers=OWNER)
    assert r.status_code == 200
    assert client.get(f"/api/projects/{p['id']}", headers=MEMBER).status_code == 200


# ---------------- viewers ----------------

def _project_with_viewer(client) -> dict:
    return make_project(client, viewers=["viewer@example.com"])


def test_viewer_can_read_but_cannot_write(client):
    p = _project_with_viewer(client)
    pid = p["id"]
    assert p["viewers"] == ["viewer@example.com"] and p["members"] == ["owner@example.com", "member@example.com"]
    t = add_task(client, pid, "作業", headers=OWNER)

    for path in ("", "/items", "/dashboard", "/compass", "/reports", "/evaluations/latest", "/members"):
        assert client.get(f"/api/projects/{pid}{path}", headers=VIEWER).status_code == 200, path
    assert [x["id"] for x in client.get("/api/projects", headers=VIEWER).json()] == [pid]

    writes = [
        ("post", "/items", {"type": "task", "title": "新規"}),
        ("post", "/items/bulk", {"tasks": [{"title": "一括"}]}),
        ("patch", f"/items/{t['id']}", {"title": "変更"}),
        ("delete", f"/items/{t['id']}", None),
        ("post", "/feedback", {"task_id": t["id"], "judgement": "agree"}),
        ("post", "/evaluations", None),
        ("post", "/reports", None),
        ("post", "/tasks/extract", {"text": "議事録"}),
        ("patch", "", {"title": "改題"}),
        ("delete", "", None),
    ]
    for method, path, body in writes:
        r = getattr(client, method)(f"/api/projects/{pid}{path}", headers=VIEWER, **({"json": body} if body is not None else {}))
        assert r.status_code == 403, (method, path, r.status_code, r.text)
        assert r.json()["error"]["code"] == "FORBIDDEN"
    # nothing changed
    assert client.get(f"/api/projects/{pid}", headers=OWNER).json()["title"] == p["title"]


def test_viewer_cannot_use_chat(client):
    pid = _project_with_viewer(client)["id"]
    assert client.get(f"/api/projects/{pid}/chat", headers=VIEWER).status_code == 403
    assert client.post(f"/api/projects/{pid}/chat", json={"message": "こんにちは"}, headers=VIEWER).status_code == 403


def test_editor_member_can_still_write_and_admin_always_can(client):
    pid = _project_with_viewer(client)["id"]
    add_task(client, pid, "編集者の作業", headers=MEMBER)
    add_task(client, pid, "管理者の作業", headers=ADMIN)


def test_stranger_still_gets_404_not_403(client):
    pid = _project_with_viewer(client)["id"]
    assert client.get(f"/api/projects/{pid}", headers=STRANGER).status_code == 404
    assert client.get(f"/api/projects/{pid}/members", headers=STRANGER).status_code == 404


# ---------------- changing roles ----------------

def test_owner_changes_roles_and_editor_wins_when_listed_twice(client):
    p = make_project(client)
    pid = p["id"]
    register_users(client, ["viewer@example.com"])
    r = client.patch(f"/api/projects/{pid}",
                     json={"members": ["owner@example.com"], "viewers": ["member@example.com", "viewer@example.com"]}, headers=OWNER)
    assert r.status_code == 200
    assert r.json()["members"] == ["owner@example.com"] and r.json()["viewers"] == ["member@example.com", "viewer@example.com"]
    assert client.post(f"/api/projects/{pid}/items", json={"type": "task", "title": "x"}, headers=MEMBER).status_code == 403

    r = client.patch(f"/api/projects/{pid}",
                     json={"members": ["owner@example.com", "member@example.com"], "viewers": ["member@example.com"]}, headers=OWNER)
    assert r.json()["members"] == ["owner@example.com", "member@example.com"] and r.json()["viewers"] == []


def test_updating_only_members_keeps_viewers_and_owner_cannot_be_demoted(client):
    p = _project_with_viewer(client)
    r = client.patch(f"/api/projects/{p['id']}", json={"members": []}, headers=OWNER)
    assert r.json()["members"] == ["owner@example.com"] and r.json()["viewers"] == ["viewer@example.com"]
    r = client.patch(f"/api/projects/{p['id']}", json={"viewers": ["owner@example.com"]}, headers=OWNER)
    assert r.json()["viewers"] == [] and r.json()["members"] == ["owner@example.com"]


def test_only_owner_or_admin_changes_members(client):
    p = _project_with_viewer(client)
    assert client.patch(f"/api/projects/{p['id']}", json={"viewers": []}, headers=MEMBER).status_code == 403
    assert client.patch(f"/api/projects/{p['id']}", json={"viewers": []}, headers=ADMIN).status_code == 200


def test_members_endpoint_returns_names_roles_and_falls_back_to_email(client):
    p = _project_with_viewer(client)
    client.put("/api/users/member@example.com", json={"name": "田中 花子", "department": "開発"}, headers=ADMIN)
    client.delete("/api/users/viewer@example.com", headers=ADMIN)
    rows = {r["email"]: r for r in client.get(f"/api/projects/{p['id']}/members", headers=MEMBER).json()}
    assert rows["owner@example.com"]["role"] == "owner" and rows["owner@example.com"]["name"] == "owner@example.com"
    assert rows["member@example.com"] == {"email": "member@example.com", "name": "田中 花子", "department": "開発", "role": "editor"}
    assert rows["viewer@example.com"]["role"] == "viewer" and rows["viewer@example.com"]["name"] == "viewer@example.com"


def test_legacy_project_without_viewers_field_still_works(client, repos):
    p = make_project(client)
    doc = repos.projects.get(p["id"])
    doc.pop("viewers", None)
    repos.projects.save(doc)
    assert client.get(f"/api/projects/{p['id']}", headers=MEMBER).json()["viewers"] == []
    assert client.get(f"/api/projects/{p['id']}/members", headers=MEMBER).status_code == 200
    assert client.patch(f"/api/projects/{p['id']}", json={"title": "改題"}, headers=OWNER).status_code == 200
