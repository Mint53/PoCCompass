"""Document store abstraction. Only this package knows about Cosmos.

Backends:
- MemoryStore: tests
- LocalFileStore: local development without Cosmos (STORAGE_BACKEND=local)
- CosmosStore: Azure (STORAGE_BACKEND=cosmos)
"""

from __future__ import annotations

import copy
import json
import logging
import re
import threading
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from app.config.settings import get_settings
from app.constants.enums import PARTITION_KEYS, Container

logger = logging.getLogger(__name__)

_FIELD_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _check_field(name: str) -> str:
    if not _FIELD_RE.match(name):
        raise ValueError(f"invalid field name: {name}")
    return name


class DocumentStore(Protocol):
    def get(self, container: Container, doc_id: str, partition_key: str) -> dict | None: ...

    def upsert(self, container: Container, doc: dict) -> dict: ...

    def delete(self, container: Container, doc_id: str, partition_key: str) -> None: ...

    def find(
        self,
        container: Container,
        *,
        partition_key: str | None = None,
        equals: dict[str, Any] | None = None,
        array_contains: tuple[str, Any] | None = None,
        order_by: str | None = None,
        descending: bool = False,
        limit: int | None = None,
    ) -> list[dict]: ...


class MemoryStore:
    def __init__(self) -> None:
        self._data: dict[str, dict[tuple[str, str], dict]] = {c.value: {} for c in Container}
        self._lock = threading.RLock()

    # hook for LocalFileStore
    def _persist(self, container: Container) -> None:  # noqa: B027 - intentional no-op hook
        pass

    def get(self, container: Container, doc_id: str, partition_key: str) -> dict | None:
        with self._lock:
            doc = self._data[container.value].get((partition_key, doc_id))
            return copy.deepcopy(doc) if doc else None

    def upsert(self, container: Container, doc: dict) -> dict:
        pk = doc[PARTITION_KEYS[container]]
        with self._lock:
            self._data[container.value][(pk, doc["id"])] = copy.deepcopy(doc)
            self._persist(container)
        return copy.deepcopy(doc)

    def delete(self, container: Container, doc_id: str, partition_key: str) -> None:
        with self._lock:
            self._data[container.value].pop((partition_key, doc_id), None)
            self._persist(container)

    def find(
        self,
        container: Container,
        *,
        partition_key: str | None = None,
        equals: dict[str, Any] | None = None,
        array_contains: tuple[str, Any] | None = None,
        order_by: str | None = None,
        descending: bool = False,
        limit: int | None = None,
    ) -> list[dict]:
        with self._lock:
            docs = [copy.deepcopy(d) for (pk, _), d in self._data[container.value].items()
                    if partition_key is None or pk == partition_key]
        for k, v in (equals or {}).items():
            docs = [d for d in docs if d.get(_check_field(k)) == v]
        if array_contains:
            field, value = array_contains
            docs = [d for d in docs if value in (d.get(_check_field(field)) or [])]
        if order_by:
            docs.sort(key=lambda d: (d.get(_check_field(order_by)) is None, d.get(order_by) or ""), reverse=descending)
        return docs[:limit] if limit else docs


class LocalFileStore(MemoryStore):
    """JSON file per container. Development only — not safe for multiple processes."""

    def __init__(self, directory: str) -> None:
        super().__init__()
        self._dir = Path(directory)
        self._dir.mkdir(parents=True, exist_ok=True)
        for c in Container:
            path = self._dir / f"{c.value}.json"
            if path.exists():
                rows = json.loads(path.read_text(encoding="utf-8"))
                pk_field = PARTITION_KEYS[c]
                self._data[c.value] = {(r[pk_field], r["id"]): r for r in rows}

    def _persist(self, container: Container) -> None:
        path = self._dir / f"{container.value}.json"
        rows = list(self._data[container.value].values())
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        # Windows: antivirus / indexers briefly lock the target file, so os.replace can fail with WinError 5.
        for attempt in range(20):
            try:
                tmp.replace(path)
                return
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.05)


class CosmosStore:
    def __init__(self, endpoint: str, database: str) -> None:
        # Entra ID only: the account has local (key) auth disabled (infra/modules/resources.bicep).
        from azure.cosmos import CosmosClient

        from app.core.credentials import get_credential

        client = CosmosClient(endpoint, credential=get_credential())
        self._db = client.get_database_client(database)
        self._containers: dict[str, Any] = {}
        self._lock = threading.Lock()

    def _container(self, container: Container):
        with self._lock:
            if container.value not in self._containers:
                self._containers[container.value] = self._db.get_container_client(container.value)
            return self._containers[container.value]

    def get(self, container: Container, doc_id: str, partition_key: str) -> dict | None:
        from azure.cosmos.exceptions import CosmosResourceNotFoundError

        try:
            return self._container(container).read_item(item=doc_id, partition_key=partition_key)
        except CosmosResourceNotFoundError:
            return None

    def upsert(self, container: Container, doc: dict) -> dict:
        return self._container(container).upsert_item(doc)

    def delete(self, container: Container, doc_id: str, partition_key: str) -> None:
        from azure.cosmos.exceptions import CosmosResourceNotFoundError

        try:
            self._container(container).delete_item(item=doc_id, partition_key=partition_key)
        except CosmosResourceNotFoundError:
            pass

    def find(
        self,
        container: Container,
        *,
        partition_key: str | None = None,
        equals: dict[str, Any] | None = None,
        array_contains: tuple[str, Any] | None = None,
        order_by: str | None = None,
        descending: bool = False,
        limit: int | None = None,
    ) -> list[dict]:
        clauses: list[str] = []
        params: list[dict[str, Any]] = []
        for i, (k, v) in enumerate((equals or {}).items()):
            clauses.append(f"c.{_check_field(k)} = @p{i}")
            params.append({"name": f"@p{i}", "value": v})
        if array_contains:
            field, value = array_contains
            clauses.append(f"ARRAY_CONTAINS(c.{_check_field(field)}, @ac)")
            params.append({"name": "@ac", "value": value})
        top = f"TOP {int(limit)} " if limit else ""
        sql = f"SELECT {top}* FROM c"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        if order_by:
            sql += f" ORDER BY c.{_check_field(order_by)} {'DESC' if descending else 'ASC'}"
        kwargs: dict[str, Any] = {"query": sql, "parameters": params}
        if partition_key is not None:
            kwargs["partition_key"] = partition_key
        else:
            kwargs["enable_cross_partition_query"] = True
        return list(self._container(container).query_items(**kwargs))


@lru_cache(maxsize=1)
def get_store() -> DocumentStore:
    s = get_settings()
    if s.storage_backend == "cosmos":
        logger.info("storage backend: cosmos (%s)", s.cosmos_database)
        return CosmosStore(s.cosmos_endpoint, s.cosmos_database)
    if s.running_on_azure:
        raise RuntimeError("STORAGE_BACKEND=local is not allowed on Azure")
    logger.info("storage backend: local files (%s)", s.local_data_dir)
    return LocalFileStore(s.local_data_dir)
