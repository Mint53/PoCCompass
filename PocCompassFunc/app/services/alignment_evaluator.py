"""AI task-vs-goal evaluation — SPEC §4. Batches tasks, calls the LLM, normalizes its output."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from app.constants.enums import Verdict
from app.constants.limits import (
    ACTION_MAX,
    ALIGNED_MIN,
    MAX_PARALLEL_AI_CALLS,
    REASON_MAX,
    TASKS_PER_AI_CALL,
    UNNECESSARY_MAX_EXCLUSIVE,
    WEAK_MIN,
)
from app.core.hashing import task_content_hash
from app.services.llm_client import LlmClient
from app.services.prompts import (
    EVALUATION_SCHEMA,
    AliasMap,
    evaluation_system_prompt,
    evaluation_user_prompt,
    humanize_aliases,
)

logger = logging.getLogger(__name__)


def normalize_verdict(verdict: str, score: int) -> str:
    """SPEC §4.3 step 2."""
    if verdict == Verdict.ALIGNED.value and score < ALIGNED_MIN:
        return Verdict.WEAK.value
    if verdict == Verdict.WEAK.value:
        if score >= ALIGNED_MIN:
            return Verdict.ALIGNED.value
        if score < WEAK_MIN:
            return Verdict.DRIFT.value
    if verdict == Verdict.DRIFT.value and score >= WEAK_MIN:
        return Verdict.WEAK.value
    if verdict == Verdict.UNNECESSARY.value and score >= UNNECESSARY_MAX_EXCLUSIVE:
        return Verdict.WEAK.value
    if verdict not in {v.value for v in Verdict}:
        return Verdict.WEAK.value if score >= WEAK_MIN else Verdict.DRIFT.value
    return verdict


def _prose(value: object, mode: dict | None) -> str:
    text = str(value or "")
    return humanize_aliases(text, mode) if mode else text


def normalize_result(raw: dict, tmap: AliasMap, amap: AliasMap, cmap: AliasMap, tasks_by_id: dict[str, dict],
                     mode: dict | None = None) -> dict | None:
    task_ids = tmap.resolve([raw.get("task_id", "")])
    if not task_ids or task_ids[0] not in tasks_by_id:
        return None
    task = tasks_by_id[task_ids[0]]
    try:
        score = int(round(float(raw.get("alignment_score", 0))))
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))
    return {
        "task_id": task["id"],
        "content_hash": task_content_hash(task),
        "alignment_score": score,
        "verdict": normalize_verdict(str(raw.get("verdict", "")), score),
        "linked_assumption_ids": amap.resolve(list(raw.get("linked_assumption_ids") or [])),
        "linked_criterion_ids": cmap.resolve(list(raw.get("linked_criterion_ids") or [])),
        "reason": _prose(raw.get("reason", ""), mode)[:REASON_MAX],
        "suggested_action": _prose(raw.get("suggested_action", ""), mode)[:ACTION_MAX],
        "reused": False,
    }


def evaluate_tasks(llm: LlmClient, mode: dict, project: dict, assumptions: list[dict], criteria: list[dict],
                   tasks: list[dict]) -> tuple[list[dict], int]:
    """Return (normalized results, number of AI calls). Tasks missing from the AI output are simply absent."""
    if not tasks:
        return [], 0
    amap = AliasMap("A", [a["id"] for a in assumptions])
    cmap = AliasMap("C", [c["id"] for c in criteria])
    tmap = AliasMap("T", [t["id"] for t in tasks])
    tasks_by_id = {t["id"]: t for t in tasks}
    system = evaluation_system_prompt(mode)
    batches = [tasks[i:i + TASKS_PER_AI_CALL] for i in range(0, len(tasks), TASKS_PER_AI_CALL)]

    def run(batch: list[dict]) -> list[dict]:
        user = evaluation_user_prompt(project, assumptions, criteria, batch, amap, cmap, tmap)
        out = llm.complete_json(system=system, user=user, schema_name="task_evaluation", schema=EVALUATION_SCHEMA)
        return list(out.get("results") or [])

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_AI_CALLS) as pool:
        raw_lists = list(pool.map(run, batches))

    results: dict[str, dict] = {}
    for raw in (r for lst in raw_lists for r in lst):
        norm = normalize_result(raw, tmap, amap, cmap, tasks_by_id, mode)
        if norm and norm["task_id"] not in results:
            results[norm["task_id"]] = norm
    missing = [t["id"] for t in tasks if t["id"] not in results]
    if missing:
        logger.warning("AI returned no result for %d task(s)", len(missing))
    return list(results.values()), len(batches)
