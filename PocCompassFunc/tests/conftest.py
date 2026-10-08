from __future__ import annotations

import json
import re
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api import create_app
from app.controllers import deps
from app.repositories.store import MemoryStore
from app.services.context import Repos

OWNER = {"x-poccompass-user-email": "owner@example.com", "x-poccompass-user-name": "%E3%82%AA%E3%83%BC%E3%83%8A%E3%83%BC"}
MEMBER = {"x-poccompass-user-email": "member@example.com"}
STRANGER = {"x-poccompass-user-email": "stranger@example.com"}
ADMIN = {"x-poccompass-user-email": "admin@example.com"}


class FakeLlm:
    """Deterministic stand-in for the LLM. Scores tasks by keywords in the title."""

    model_name = "fake-model"

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = False
        self.chat_reply: dict[str, Any] = {"reply": "了解しました。", "operations": []}

    def complete_json(self, *, system: str, user: str, schema_name: str, schema: dict[str, Any]) -> dict[str, Any]:
        self.calls.append({"schema": schema_name, "system": system, "user": user})
        if self.fail:
            from app.core.errors import AiFailed

            raise AiFailed()
        if schema_name == "task_evaluation":
            payload = json.loads(user[user.index("{"):])
            results = []
            for t in payload["tasks"]:
                title = t["title"]
                if "ダークモード" in title or "多言語" in title:
                    score, verdict = 20, "unnecessary_candidate"
                elif "別件" in title:
                    score, verdict = 10, "drift"
                elif "周辺" in title:
                    score, verdict = 55, "weak"
                else:
                    score, verdict = 90, "aligned"
                results.append({"task_id": t["task_id"], "alignment_score": score, "verdict": verdict,
                                "linked_assumption_ids": ["A1", "A99"], "linked_criterion_ids": [],
                                "reason": f"{title} の判定理由", "suggested_action": "見直す"})
            return {"results": results}
        if schema_name == "decision_report":
            opt = {"supporting": ["s"], "concerns": ["c"], "conditions": ["k"]}
            return {"summary": "要約", "highlights": ["h1"],
                    "options": [{"decision": "stop", **opt}, {"decision": "continue", **opt}, {"decision": "pivot", **opt}],
                    "questions": ["q"], "next_actions": ["n"]}
        if schema_name == "task_extraction":
            m = re.search(r'"id": "(A\d+)"', user)
            return {"tasks": [{"title": "ヒアリングを実施する", "description": "", "linked_assumption_ids": [m.group(1)] if m else [],
                               "linked_criterion_ids": ["C404"]}, {"title": "  ", "description": "", "linked_assumption_ids": [],
                                                                     "linked_criterion_ids": []}]}
        if schema_name == "chat_reply":
            return self.chat_reply
        raise AssertionError(schema_name)


@pytest.fixture
def store() -> MemoryStore:
    return MemoryStore()


@pytest.fixture
def repos(store: MemoryStore) -> Repos:
    return Repos.from_store(store)


@pytest.fixture
def llm() -> FakeLlm:
    return FakeLlm()


@pytest.fixture
def client(repos: Repos, llm: FakeLlm, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    monkeypatch.setenv("DEV_USER_EMAIL", "")
    monkeypatch.delenv("WEBSITE_INSTANCE_ID", raising=False)
    from app.config.settings import get_settings

    get_settings.cache_clear()
    app = create_app()
    app.dependency_overrides[deps.get_repos] = lambda: repos
    app.dependency_overrides[deps.get_llm_client] = lambda: llm
    yield TestClient(app, raise_server_exceptions=False)
    get_settings.cache_clear()


def make_project(client: TestClient, mode: str = "poc", **overrides: Any) -> dict:
    body = {
        "mode": mode,
        "title": "問い合わせ自動分類 PoC",
        "goal": "問い合わせ一次対応の工数削減を見極める",
        "start_date": "2026-09-01",
        "deadline": "2026-12-31",
        "members": ["member@example.com"],
        "assumptions": [{"text": "7 割は定型", "priority": "high"}, {"text": "AI で分類できる"}],
        "criteria": [{"text": "正解率 85% 以上", "target": "85%"}],
        **overrides,
    }
    r = client.post("/api/projects", json=body, headers=OWNER)
    assert r.status_code == 201, r.text
    return r.json()


def add_task(client: TestClient, project_id: str, title: str, headers: dict | None = None, **fields: Any) -> dict:
    r = client.post(f"/api/projects/{project_id}/items", json={"type": "task", "title": title, **fields},
                    headers=headers or OWNER)
    assert r.status_code == 201, r.text
    return r.json()
