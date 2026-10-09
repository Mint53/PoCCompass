"""Global roles (admin / global viewer / general) and per-project department sharing — SPEC §3.7, §9, §14."""

from __future__ import annotations

from tests.conftest import ADMIN, OWNER, make_project, register_users

DEPT = "営業部"


def hdr(email: str) -> dict:
    return {"x-poccompass-user-email": email}


def setup_users(client) -> None:
    register_users(client, ["owner@example.com", "gv@example.com", "sales@example.com", "other@example.com"])
    for email, dept in [("owner@example.com", DEPT), ("sales@example.com", DEPT), ("other@example.com", "経理部")]:
        r = client.put(f"/api/users/{email}", json={"name": email.split("@")[0], "department": dept}, headers=ADMIN)
        assert r.status_code == 200, r.text
    r = client.put("/api/users/gv@example.com", json={"name": "gv", "department": "", "role": "global_viewer"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["role"] == "global_viewer" and not r.json()["is_admin"]


def test_global_viewer_sees_everything_read_only(client):
    setup_users(client)
    p = make_project(client)
    gv = hdr("gv@example.com")
    assert [x["id"] for x in client.get("/api/projects", headers=gv).json()] == [p["id"]]
    assert client.get(f"/api/projects/{p['id']}", headers=gv).status_code == 200
    assert client.get(f"/api/projects/{p['id']}/items", headers=gv).status_code == 200
    r = client.post(f"/api/projects/{p['id']}/items", json={"type": "task", "title": "x"}, headers=gv)
    assert r.status_code == 403
    assert client.patch(f"/api/projects/{p['id']}", json={"title": "x"}, headers=gv).status_code == 403
    assert client.delete(f"/api/projects/{p['id']}", headers=gv).status_code == 403
    assert client.get("/api/me", headers=gv).json()["role"] == "global_viewer"
    assert client.post("/api/modes/poc/reset", headers=gv).status_code == 403
    assert client.post("/api/users", json={"email": "n@example.com", "name": "n"}, headers=gv).status_code == 403


def test_general_user_without_membership_sees_nothing(client):
    setup_users(client)
    p = make_project(client)
    other = hdr("other@example.com")
    assert client.get("/api/projects", headers=other).json() == []
    assert client.get(f"/api/projects/{p['id']}", headers=other).status_code == 404


def test_department_sharing(client):
    setup_users(client)
    p = make_project(client)
    sales, other = hdr("sales@example.com"), hdr("other@example.com")
    # not shared yet
    assert client.get(f"/api/projects/{p['id']}", headers=sales).status_code == 404
    r = client.patch(f"/api/projects/{p['id']}", json={"share_with_department": True}, headers=OWNER)
    assert r.status_code == 200 and r.json()["shared_department"] == DEPT
    # same department: can view and list, cannot edit
    assert client.get(f"/api/projects/{p['id']}", headers=sales).status_code == 200
    assert [x["id"] for x in client.get("/api/projects", headers=sales).json()] == [p["id"]]
    assert client.post(f"/api/projects/{p['id']}/items", json={"type": "task", "title": "x"}, headers=sales).status_code == 403
    assert client.patch(f"/api/projects/{p['id']}", json={"share_with_department": False}, headers=sales).status_code == 403
    # other department: still hidden
    assert client.get(f"/api/projects/{p['id']}", headers=other).status_code == 404
    # turned off again
    r = client.patch(f"/api/projects/{p['id']}", json={"share_with_department": False}, headers=OWNER)
    assert r.json()["shared_department"] == ""
    assert client.get(f"/api/projects/{p['id']}", headers=sales).status_code == 404


def test_share_on_create_and_requires_owner_department(client):
    register_users(client, ["owner@example.com"])
    client.put("/api/users/owner@example.com", json={"name": "owner", "department": ""}, headers=ADMIN)
    body = {"mode": "poc", "title": "t", "goal": "g", "deadline": "2026-12-31", "share_with_department": True,
            "assumptions": [{"text": "a"}], "criteria": [{"text": "c"}]}
    r = client.post("/api/projects", json=body, headers=OWNER)
    assert r.status_code == 400 and "部署" in r.json()["error"]["message"]
    client.put("/api/users/owner@example.com", json={"name": "owner", "department": DEPT}, headers=ADMIN)
    r = client.post("/api/projects", json=body, headers=OWNER)
    assert r.status_code == 201 and r.json()["shared_department"] == DEPT


def test_role_management_rules(client):
    setup_users(client)
    # only admins can change roles
    r = client.put("/api/users/other@example.com", json={"name": "o", "department": "", "role": "admin"}, headers=OWNER)
    assert r.status_code == 403
    # promote to admin through the screen: that user can now manage users
    r = client.put("/api/users/other@example.com", json={"name": "o", "department": "", "role": "admin"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["is_admin"]
    assert client.get("/api/me", headers=hdr("other@example.com")).json()["is_admin"] is True
    # omitting role keeps it
    r = client.put("/api/users/other@example.com", json={"name": "o2", "department": ""}, headers=ADMIN)
    assert r.json()["role"] == "admin"
    # cannot change own role; ADMIN_EMAILS admins are locked
    r = client.put("/api/users/other@example.com", json={"name": "o", "department": "", "role": "general"},
                   headers=hdr("other@example.com"))
    assert r.status_code == 400
    client.post("/api/users", json={"email": "admin@example.com", "name": "a"}, headers=ADMIN)
    r = client.put("/api/users/admin@example.com", json={"name": "a", "department": "", "role": "general"},
                   headers=hdr("other@example.com"))
    assert r.status_code == 400
    # demoting is fine while another admin exists
    r = client.put("/api/users/other@example.com", json={"name": "o", "department": "", "role": "general"}, headers=ADMIN)
    assert r.status_code == 200 and not r.json()["is_admin"]
    users = {u["email"]: u for u in client.get("/api/users", headers=ADMIN).json()}
    assert users["admin@example.com"]["role_locked"] and users["admin@example.com"]["role"] == "admin"


def test_last_admin_cannot_be_removed(client, monkeypatch):
    from app.config.settings import get_settings

    monkeypatch.setenv("ADMIN_EMAILS", "")
    get_settings.cache_clear()
    # bootstrap: nobody is an admin, so use a master admin created directly
    import app.controllers.deps as deps
    from app.repositories.store import MemoryStore  # noqa: F401

    repos = client.app.dependency_overrides[deps.get_repos]()
    now = "2026-01-01T00:00:00+00:00"
    for e, role in [("a1@example.com", "admin"), ("a2@example.com", "admin")]:
        repos.users.save({"id": e, "email": e, "name": e, "department": "", "role": role, "created_at": now, "updated_at": now})
    a1, a2 = hdr("a1@example.com"), hdr("a2@example.com")
    assert client.put("/api/users/a2@example.com", json={"name": "a2", "department": "", "role": "general"}, headers=a1).status_code == 200
    # a1 is now the only admin: deleting them (by themselves) or demoting would leave none
    assert client.delete("/api/users/a1@example.com", headers=a1).status_code == 400
    assert client.get("/api/users", headers=a2).status_code == 200
