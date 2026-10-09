"""Enumerations shared across layers. Values are persisted — never rename without a migration. See docs/SPEC.md §3."""

from enum import StrEnum


class Mode(StrEnum):
    POC = "poc"
    PLANNING = "planning"
    IMPROVEMENT = "improvement"


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    STOPPED = "stopped"
    COMPLETED = "completed"


class ItemType(StrEnum):
    ASSUMPTION = "assumption"
    CRITERION = "criterion"
    TASK = "task"
    EVIDENCE = "evidence"
    FEEDBACK = "feedback"
    DECISION = "decision"
    REQUEST = "request"
    PROCESS_STEP = "process_step"


class AssumptionStatus(StrEnum):
    UNTESTED = "untested"
    TESTING = "testing"
    SUPPORTED = "supported"
    REJECTED = "rejected"


class Priority(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class CriterionStatus(StrEnum):
    NOT_MET = "not_met"
    MET = "met"


class TaskStatus(StrEnum):
    TODO = "todo"
    DOING = "doing"
    DONE = "done"


class EvidenceResult(StrEnum):
    SUPPORTS = "supports"
    REFUTES = "refutes"
    INCONCLUSIVE = "inconclusive"


class FeedbackJudgement(StrEnum):
    AGREE = "agree"
    DISMISS = "dismiss"


class Decision(StrEnum):
    CONTINUE = "continue"
    PIVOT = "pivot"
    STOP = "stop"


class RequestKind(StrEnum):
    REQUEST = "request"
    ISSUE = "issue"


class RequestAction(StrEnum):
    UNDECIDED = "undecided"
    NEEDED = "needed"
    NOT_NEEDED = "not_needed"


class ProcessVariant(StrEnum):
    ASIS = "asis"
    TOBE = "tobe"


class Verdict(StrEnum):
    ALIGNED = "aligned"
    WEAK = "weak"
    DRIFT = "drift"
    UNNECESSARY = "unnecessary_candidate"


class EvaluationTrigger(StrEnum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"


class Container(StrEnum):
    PROJECTS = "projects"
    ITEMS = "project_items"
    EVALUATIONS = "evaluations"
    SNAPSHOTS = "health_snapshots"
    REPORTS = "reports"
    MODES = "mode_definitions"
    CHAT = "chat_messages"
    USERS = "users"


# Partition key path per container (must match infra/modules/resources.bicep).
PARTITION_KEYS: dict[Container, str] = {
    Container.PROJECTS: "id",
    Container.ITEMS: "projectId",
    Container.EVALUATIONS: "projectId",
    Container.SNAPSHOTS: "projectId",
    Container.REPORTS: "projectId",
    Container.MODES: "id",
    Container.CHAT: "projectId",
    Container.USERS: "id",
}


class MemberRole(StrEnum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class ChatRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class ProposalStatus(StrEnum):
    PENDING = "pending"
    APPLIED = "applied"
    PARTIALLY_APPLIED = "partially_applied"
    DISCARDED = "discarded"


class OperationKind(StrEnum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class OperationTarget(StrEnum):
    ASSUMPTION = "assumption"
    CRITERION = "criterion"
    TASK = "task"
    EVIDENCE = "evidence"
    PROJECT = "project"
