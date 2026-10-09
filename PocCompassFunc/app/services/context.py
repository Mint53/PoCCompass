"""Bundles repositories so services take one argument. Built per request from the configured store."""

from __future__ import annotations

from dataclasses import dataclass

from app.repositories.repos import (
    ChatRepository,
    EvaluationRepository,
    ItemRepository,
    ModeRepository,
    ProjectRepository,
    ReportRepository,
    SnapshotRepository,
    UserRepository,
)
from app.repositories.store import DocumentStore, get_store


@dataclass
class Repos:
    projects: ProjectRepository
    items: ItemRepository
    evaluations: EvaluationRepository
    snapshots: SnapshotRepository
    reports: ReportRepository
    modes: ModeRepository
    chat: ChatRepository
    users: UserRepository

    @classmethod
    def from_store(cls, store: DocumentStore) -> Repos:
        return cls(ProjectRepository(store), ItemRepository(store), EvaluationRepository(store),
                   SnapshotRepository(store), ReportRepository(store), ModeRepository(store), ChatRepository(store),
                   UserRepository(store))


def default_repos() -> Repos:
    return Repos.from_store(get_store())
