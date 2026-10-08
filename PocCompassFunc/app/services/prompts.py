"""Prompt text and JSON schemas for every AI call. Changing anything here = re-run the accuracy check (docs/HARNESS.md).

IDs are replaced by short aliases (A1, C1, T1) in prompts so the model does not have to copy UUIDs.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.constants.enums import Decision, Verdict
from app.constants.limits import ACTION_MAX, REASON_MAX


class AliasMap:
    def __init__(self, prefix: str, ids: list[str]):
        self.to_alias = {i: f"{prefix}{n}" for n, i in enumerate(ids, start=1)}
        self.to_id = {v: k for k, v in self.to_alias.items()}

    def alias(self, real_id: str) -> str:
        return self.to_alias[real_id]

    def resolve(self, aliases: list[str]) -> list[str]:
        return [self.to_id[a] for a in aliases if a in self.to_id]


def _str_array() -> dict[str, Any]:
    return {"type": "array", "items": {"type": "string"}}


def _obj(props: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


# ---------------- task evaluation (SPEC §4) ----------------

EVALUATION_SCHEMA = _obj({
    "results": {
        "type": "array",
        "items": _obj({
            "task_id": {"type": "string"},
            "alignment_score": {"type": "integer"},
            "verdict": {"type": "string", "enum": [v.value for v in Verdict]},
            "linked_assumption_ids": _str_array(),
            "linked_criterion_ids": _str_array(),
            "reason": {"type": "string"},
            "suggested_action": {"type": "string"},
        }),
    }
})


def evaluation_system_prompt(mode: dict) -> str:
    lb = mode["labels"]
    return f"""あなたはプロジェクトマネジメントの専門家です。取り組みの種類は「{mode['name']}」です。
各{lb['task']}が「{lb['goal']}」「{lb['assumption']}」「{lb['criterion']}」の達成に本当に必要かを判定します。
進捗や作業量ではなく「目的に合っているか」だけを見てください。

## 判定基準
- alignment_score: 0〜100 の整数。{lb['assumption']}の検証または{lb['criterion']}の達成への直接の寄与度。
- verdict:
  - aligned (70〜100): {lb['assumption']}の検証または{lb['criterion']}の達成に直接寄与する
  - weak (40〜69): 間接的には寄与するが、なくても検証・判定できる
  - drift (0〜39): {lb['goal']}・{lb['assumption']}とは別の目的に向かっている（目的逸脱の疑い）
  - unnecessary_candidate (0〜59): {lb['goal']}には関係するが、どの{lb['criterion']}の判定にも不要な作り込み
- linked_assumption_ids / linked_criterion_ids: 寄与する{lb['assumption']}・{lb['criterion']}の ID（A1, C1 など）。無ければ空配列。
- reason: 判定理由。日本語 {REASON_MAX} 字以内。どの{lb['assumption']}・{lb['criterion']}との関係で判断したかを具体的に書く。
  ID（A1, C2 など）は reason と suggested_action に書かず、内容を短く言い換えて書く（読み手は ID を知らない）。
- suggested_action: 次にとるべき行動。日本語 {ACTION_MAX} 字以内。aligned なら空文字でよい。

## この種類の取り組みでの考え方
{mode['prompt_guidance']}

## 注意
- 人が付けたひも付け（human_links）は参考情報です。内容と合っていなければ従わなくてよい。
- 完了済みの{lb['task']}も同じ基準で判定します（すでに使った工数の妥当性を見るため）。
- 入力された全ての task_id について 1 件ずつ結果を返してください。"""


def evaluation_user_prompt(project: dict, assumptions: list[dict], criteria: list[dict], tasks: list[dict],
                           amap: AliasMap, cmap: AliasMap, tmap: AliasMap) -> str:
    payload = {
        "goal": project["goal"],
        "assumptions": [{"id": amap.alias(a["id"]), "text": a["text"], "status": a["status"]} for a in assumptions],
        "criteria": [{"id": cmap.alias(c["id"]), "text": c["text"], "target": c.get("target", "")} for c in criteria],
        "tasks": [
            {
                "task_id": tmap.alias(t["id"]),
                "title": t["title"],
                "description": t.get("description", ""),
                "status": t["status"],
                "human_links": [amap.alias(i) for i in t.get("linked_assumption_ids", []) if i in amap.to_alias]
                + [cmap.alias(i) for i in t.get("linked_criterion_ids", []) if i in cmap.to_alias],
            }
            for t in tasks
        ],
    }
    return "以下の取り組みについて、tasks の各要素を判定してください。\n\n" + json.dumps(payload, ensure_ascii=False, indent=1)


# ---------------- decision report (SPEC §7) ----------------

REPORT_SCHEMA = _obj({
    "summary": {"type": "string"},
    "highlights": _str_array(),
    "options": {
        "type": "array",
        "items": _obj({
            "decision": {"type": "string", "enum": [d.value for d in Decision]},
            "supporting": _str_array(),
            "concerns": _str_array(),
            "conditions": _str_array(),
        }),
    },
    "questions": _str_array(),
    "next_actions": _str_array(),
})


def report_system_prompt(mode: dict) -> str:
    lb = mode["labels"]
    return f"""あなたは意思決定会議の資料を準備するアナリストです。取り組みの種類は「{mode['name']}」です。
{lb['decision_continue']}・{lb['decision_pivot']}・{lb['decision_stop']}を判断するための「判断材料」を整理します。
**判断そのものは人が行います。あなたは 1 つの結論を推奨しないでください。**

出力:
- summary: 現状を 300 字以内で要約。数値は入力の「指標」の値をそのまま使い、再計算しない。
- highlights: 判断に効く事実を 3〜6 件。
- options: continue / pivot / stop の 3 件を必ずこの順で。各々に supporting（その判断を支える事実）、
  concerns（その判断の懸念）、conditions（その判断をとるなら満たすべき条件）を 1〜4 件ずつ。
  ※ continue={lb['decision_continue']}、pivot={lb['decision_pivot']}、stop={lb['decision_stop']}
- questions: 会議で確認すべき問いを 3〜5 件。
- next_actions: どの判断でも有効な次の行動を 2〜4 件。
入力に無い事実を作らないこと。データが不足している点は不足していると書くこと。
本文は日本語で書き、英語のキー名や状態コード（health_score, not_met, drift など）や 0.32 のような小数をそのまま書かないこと。入力に書かれている日本語の表記を使う。"""


JA_VALUE = {
    "untested": "未検証", "testing": "検証中", "supported": "支持された", "rejected": "否定された",
    "not_met": "未達成", "met": "達成", "todo": "未着手", "doing": "進行中", "done": "完了",
    "high": "高", "medium": "中", "low": "低",
    "supports": "支持する", "refutes": "否定する", "inconclusive": "判断できない",
}


def _ja(value: str) -> str:
    return JA_VALUE.get(value, value)


def _pct(v: float | None) -> str:
    return "データなし" if v is None else f"{round(v * 100)}%"


def _score(v: float | None) -> str:
    return "データなし" if v is None else f"{round(v)} / 100"


def report_user_prompt(project: dict, mode: dict, assumptions: list[dict], criteria: list[dict], tasks: list[dict],
                       evidence: list[dict], dashboard: dict) -> str:
    """Everything is pre-translated to Japanese labels so internal keys/codes do not leak into the report."""
    lb = mode["labels"]
    cl = mode["card_labels"]
    h = dashboard["health"]
    comp = h["components"]
    sched = dashboard["schedule"]
    verdict_ja = {"drift": cl["drift"], "unnecessary_candidate": cl["unnecessary"], "weak": "紐づきが弱い", "aligned": "目的に合致"}
    payload = {
        "取り組み名": project["title"],
        lb["goal"]: project["goal"],
        "期間": f"{project['start_date']} 〜 {project['deadline']}",
        lb["assumption"]: [{"内容": a["text"], "状態": _ja(a["status"]), "優先度": _ja(a["priority"]),
                           lb["evidence"]: [{"内容": e["summary"], "結果": _ja(e["result"])}
                                            for e in evidence if e["assumption_id"] == a["id"]]} for a in assumptions],
        lb["criterion"]: [{"内容": c["text"], "目標値": c.get("target", ""), "状態": _ja(c["status"])} for c in criteria],
        lb["task"]: [{"名前": t["title"], "状態": _ja(t["status"]), "工数（時間）": t.get("effort_hours")} for t in tasks],
        "指標（計算済み。再計算しない）": {
            "健全度": _score(h["score"]),
            "先月比": "比較データなし" if h["delta_vs_last_month"] is None else f"{h['delta_vs_last_month']:+d}",
            "内訳": {"目的整合": _score(comp["alignment"]), "検証の進み": _score(comp["validation"]),
                   "期限": _score(comp["schedule"]), "ムダの少なさ": _score(comp["waste"])},
            cl["drift"]: f"{dashboard['cards']['drift']} 件",
            cl["unnecessary"]: f"{dashboard['cards']['unnecessary']} 件",
            cl["deadline_risk"]: f"{dashboard['cards']['deadline_risk']} 件",
            cl["untested"]: f"{dashboard['cards']['untested']} 件",
            "期間の経過": _pct(sched["elapsed"]),
            "進捗（達成・完了の割合）": _pct(sched["progress"]),
            f"{lb['deadline']}までの残り日数": sched["days_left"],
            "遅れの判定": "遅れている" if sched["delayed"] else "遅れていない",
        },
        "AI の指摘": [{"名前": a["title"], "判定": verdict_ja.get(a["verdict"], a["verdict"]), "理由": a["reason"]}
                    for a in dashboard["alerts"]],
    }
    return "以下のデータから判断材料を作成してください。\n\n" + json.dumps(payload, ensure_ascii=False, indent=1, default=str)


# ---------------- task extraction (SPEC §8) ----------------

EXTRACT_SCHEMA = _obj({
    "tasks": {
        "type": "array",
        "items": _obj({
            "title": {"type": "string"},
            "description": {"type": "string"},
            "linked_assumption_ids": _str_array(),
            "linked_criterion_ids": _str_array(),
        }),
    }
})


def extract_system_prompt(mode: dict) -> str:
    lb = mode["labels"]
    return f"""あなたはプロジェクトの記録係です。週報・議事録などのテキストから、取り組みの{lb['task']}を抽出します。
- 実施した作業・実施予定の作業だけを抽出する。感想・連絡事項・決定事項そのものは抽出しない。
- title は 40 字以内で「〜する」形。description は補足（100 字以内、無ければ空文字）。
- 関係する{lb['assumption']}・{lb['criterion']}が明らかな場合のみ ID（A1, C1 など）を付ける。推測で付けない。
- 既存の{lb['task']}（existing_tasks）と同じ内容は抽出しない。
- 該当が無ければ空配列を返す。"""


def extract_user_prompt(text: str, assumptions: list[dict], criteria: list[dict], existing_tasks: list[dict],
                        amap: AliasMap, cmap: AliasMap) -> str:
    payload = {
        "assumptions": [{"id": amap.alias(a["id"]), "text": a["text"]} for a in assumptions],
        "criteria": [{"id": cmap.alias(c["id"]), "text": c["text"]} for c in criteria],
        "existing_tasks": [t["title"] for t in existing_tasks],
    }
    return (json.dumps(payload, ensure_ascii=False, indent=1)
            + "\n\n---- テキスト ここから ----\n" + text + "\n---- テキスト ここまで ----")


ALIAS_PATTERN = r"(?<![A-Za-z0-9])([AC])(\d{1,3})(?![0-9])"
_ALIAS_RE = re.compile(ALIAS_PATTERN)


def humanize_aliases(text: str, mode: dict) -> str:
    """Replace leftover aliases (A2 / C1) in prose with 「仮説2」「成功条件1」 (SPEC §4.3)."""
    lb = mode["labels"]

    def repl(m) -> str:
        return f"{lb['assumption'] if m.group(1) == 'A' else lb['criterion']}{m.group(2)}"

    return _ALIAS_RE.sub(repl, text)
