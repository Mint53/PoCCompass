"""Prompt and JSON schema for the AI chat (SPEC §11). Changing this = re-check proposals by hand (docs/HARNESS.md)."""

from __future__ import annotations

import json
from datetime import date

from app.constants.enums import OperationKind, OperationTarget
from app.constants.limits import CHAT_MAX_OPERATIONS


def _nullable(t: str) -> dict:
    return {"type": [t, "null"]}


_NULLABLE_STR_ARRAY = {"anyOf": [{"type": "array", "items": {"type": "string"}}, {"type": "null"}]}

FIELD_PROPS = {
    "title": _nullable("string"),
    "description": _nullable("string"),
    "text": _nullable("string"),
    "status": _nullable("string"),
    "priority": _nullable("string"),
    "target_value": _nullable("string"),
    "effort_hours": _nullable("number"),
    "due_date": _nullable("string"),
    "linked_assumption_refs": _NULLABLE_STR_ARRAY,
    "linked_criterion_refs": _NULLABLE_STR_ARRAY,
    "assumption_ref": _nullable("string"),
    "summary": _nullable("string"),
    "result": _nullable("string"),
    "source": _nullable("string"),
    "goal": _nullable("string"),
    "start_date": _nullable("string"),
    "deadline": _nullable("string"),
}

CHAT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["reply", "operations"],
    "properties": {
        "reply": {"type": "string"},
        "operations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["op", "target", "ref", "fields", "reason"],
                "properties": {
                    "op": {"type": "string", "enum": [o.value for o in OperationKind]},
                    "target": {"type": "string", "enum": [t.value for t in OperationTarget]},
                    "ref": {"type": "string"},
                    "fields": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": list(FIELD_PROPS),
                        "properties": FIELD_PROPS,
                    },
                    "reason": {"type": "string"},
                },
            },
        },
    },
}


def chat_system_prompt(mode: dict, today: date) -> str:
    lb = mode["labels"]
    return f"""あなたは取り組み「{mode['name']}」の伴走役です。今日は {today.isoformat()} です。
利用者と日本語で対話し、取り組みの内容（{lb['goal']}・{lb['assumption']}・{lb['criterion']}・{lb['task']}・{lb['evidence']}）について
質問に答え、依頼があれば追加・修正・削除の「提案」を operations で返します。提案は利用者が確認して適用します。

## できること（operations）
- target=assumption（{lb['assumption']}）: create / update / delete。fields: text, status(untested|testing|supported|rejected), priority(high|medium|low)
- target=criterion（{lb['criterion']}）: create / update / delete。fields: text, target_value(目標値の文字列), status(not_met|met)
- target=task（{lb['task']}）: create / update / delete。fields: title, description, status(todo|doing|done), effort_hours(時間), due_date(YYYY-MM-DD),
  linked_assumption_refs(A番号の配列), linked_criterion_refs(C番号の配列)
- target=evidence（{lb['evidence']}）: create / update / delete。fields: assumption_ref(A番号), summary, result(supports|refutes|inconclusive), source
- target=project: update のみ。fields: title, goal, start_date, deadline（YYYY-MM-DD）
- 既存の項目を指すときは ref に別名（A1, C2, T3, E1, project は空文字）。新規作成は ref を空文字にする。
- fields には変更・設定する値だけを入れ、それ以外は null にする。update で linked_*_refs を入れると、ひも付けはその配列で置き換わる。
- 1 回の提案は最大 {CHAT_MAX_OPERATIONS} 件。

## できないこと（依頼されたら、どの画面で行うかを案内する）
- 続行・軌道修正・撤退などの判断の記録（判断レポート画面）、メンバー・モードの変更と取り組みの削除（設定画面）、AI 評価の実行（画面上部の「AI で評価」）。

## 振る舞い
- 変更を頼まれていないとき（質問・相談）は operations を空配列にする。
- 依頼があいまいで対象を特定できないときは、推測で提案せず reply で確認の質問をし、operations を空にする。
- 存在しない事実を作らない。数値は context の値を使う。
- reply は簡潔に。別名（A1, T3 など）は reply に書かず、内容で言及する。提案したときは最後に「内容を確認して『適用』を押してください。」と添える。
- この取り組みでの考え方: {mode['prompt_guidance']}"""


def chat_user_prompt(context: dict, history: list[dict], message: str) -> str:
    transcript = "\n".join(f"[{h['role']}] {h['content']}" for h in history) or "（なし）"
    return (
        "## 取り組みの現在の内容（context）\n"
        + json.dumps(context, ensure_ascii=False, indent=1, default=str)
        + "\n\n## これまでの会話\n"
        + transcript
        + "\n\n## 利用者の新しいメッセージ\n"
        + message
    )
