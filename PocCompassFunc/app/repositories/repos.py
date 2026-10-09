"""Entity repositories. Thin, typed wrappers over DocumentStore. No business rules here."""

from __future__ import annotations

from app.constants.enums import Container, ItemType
from app.repositories.store import DocumentStore


class ProjectRepository:
    def __init__(self, store: DocumentStore):
        self.s = store

    def get(self, project_id: str) -> dict | None:
        doc = self.s.get(Container.PROJECTS, project_id, project_id)
        return doc if doc and not doc.get("deleted") else None

    def save(self, doc: dict) -> dict:
        return self.s.upsert(Container.PROJECTS, doc)

    def list_for_member(self, email: str) -> list[dict]:
        # Editors (members) and read-only viewers; two simple queries instead of an OR so both stores behave the same.
        docs: dict[str, dict] = {}
        for field in ("members", "viewers"):
            for d in self.s.find(Container.PROJECTS, equals={"deleted": False}, array_contains=(field, email)):
                docs[d["id"]] = d
        return sorted(docs.values(), key=lambda d: d["updated_at"], reverse=True)

    def list_for_department(self, department: str) -> list[dict]:
        return self.s.find(Container.PROJECTS, equals={"deleted": False, "shared_department": department})

    def list_all(self) -> list[dict]:
        docs = self.s.find(Container.PROJECTS, equals={"deleted": False})
        return sorted(docs, key=lambda d: d["updated_at"], reverse=True)


class ItemRepository:
    def __init__(self, store: DocumentStore):
        self.s = store

    def list(self, project_id: str, item_type: ItemType | None = None) -> list[dict]:
        equals = {"type": item_type.value} if item_type else None
        docs = self.s.find(Container.ITEMS, partition_key=project_id, equals=equals)
        return sorted(docs, key=lambda d: d["created_at"])

    def get(self, project_id: str, item_id: str) -> dict | None:
        return self.s.get(Container.ITEMS, item_id, project_id)

    def save(self, doc: dict) -> dict:
        return self.s.upsert(Container.ITEMS, doc)

    def delete(self, project_id: str, item_id: str) -> None:
        self.s.delete(Container.ITEMS, item_id, project_id)


class EvaluationRepository:
    def __init__(self, store: DocumentStore):
        self.s = store

    def latest(self, project_id: str) -> dict | None:
        rows = self.s.find(Container.EVALUATIONS, partition_key=project_id, order_by="created_at",
                           descending=True, limit=1)
        return rows[0] if rows else None

    def recent(self, project_id: str, limit: int) -> list[dict]:
        """Newest first."""
        return self.s.find(Container.EVALUATIONS, partition_key=project_id, order_by="created_at",
                           descending=True, limit=limit)

    def save(self, doc: dict) -> dict:
        return self.s.upsert(Container.EVALUATIONS, doc)


class SnapshotRepository:
    def __init__(self, store: DocumentStore):
        self.s = store

    def list(self, project_id: str) -> list[dict]:
        return self.s.find(Container.SNAPSHOTS, partition_key=project_id, order_by="date")

    def save(self, doc: dict) -> dict:
        return self.s.upsert(Container.SNAPSHOTS, doc)


class ReportRepository:
    def __init__(self, store: DocumentStore):
        self.s = store

    def list(self, project_id: str) -> list[dict]:
        return self.s.find(Container.REPORTS, partition_key=project_id, order_by="created_at", descending=True)

    def save(self, doc: dict) -> dict:
        return self.s.upsert(Container.REPORTS, doc)


class ModeRepository:
    def __init__(self, store: DocumentStore):
        self.s = store

    def get(self, mode_id: str) -> dict | None:
        return self.s.get(Container.MODES, mode_id, mode_id)

    def list(self) -> list[dict]:
        return self.s.find(Container.MODES)

    def save(self, doc: dict) -> dict:
        return self.s.upsert(Container.MODES, doc)


class UserRepository:
    def __init__(self, store: DocumentStore):
        self.s = store

    def get(self, email: str) -> dict | None:
        return self.s.get(Container.USERS, email, email)

    def list(self) -> list[dict]:
        return self.s.find(Container.USERS)

    def save(self, doc: dict) -> dict:
        return self.s.upsert(Container.USERS, doc)

    def delete(self, email: str) -> None:
        self.s.delete(Container.USERS, email, email)


class ChatRepository:
    def __init__(self, store: DocumentStore):
        self.s = store

    def list_for_user(self, project_id: str, email: str) -> list[dict]:
        docs = self.s.find(Container.CHAT, partition_key=project_id, equals={"user_email": email})
        return sorted(docs, key=lambda d: d["created_at"])

    def get(self, project_id: str, message_id: str) -> dict | None:
        return self.s.get(Container.CHAT, message_id, project_id)

    def save(self, doc: dict) -> dict:
        return self.s.upsert(Container.CHAT, doc)

    def delete(self, project_id: str, message_id: str) -> None:
        self.s.delete(Container.CHAT, message_id, project_id)
