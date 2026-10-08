"""Default mode definitions (SPEC §2). Seeded into Cosmos `mode_definitions` when missing.

Adding a mode = add a Mode enum value + an entry here. No other code should branch on mode.
"""

from __future__ import annotations

from app.constants.enums import Mode
from app.models.mode import ModeDefinition

_POC = {
    "id": Mode.POC,
    "name": "PoC",
    "description": "技術・事業の仮説を短期間で検証し、続行／軌道修正／撤退を判断する取り組み",
    "labels": {
        "goal": "目的",
        "assumption": "仮説",
        "criterion": "成功条件",
        "deadline": "期限",
        "task": "タスク",
        "evidence": "検証データ",
        "decision_continue": "続行",
        "decision_pivot": "軌道修正",
        "decision_stop": "撤退",
    },
    "card_labels": {
        "drift": "目的逸脱の疑い",
        "drift_hint": "当初仮説と作業内容にズレ",
        "unnecessary": "不要機能候補",
        "unnecessary_hint": "成功条件に紐づかない開発項目",
        "deadline_risk": "期限リスク",
        "deadline_risk_hint": "成功条件達成前に期限が到来見込み",
        "untested": "未検証の仮説",
        "untested_hint": "検証データがまだない仮説",
        "weak_tasks_title": "目的との紐づきが弱いタスク TOP5",
        "under_evidenced_title": "検証データが不足している仮説 TOP5",
    },
    "placeholders": {
        "title": "例: 問い合わせ自動分類 PoC",
        "goal": "例: 問い合わせ一次対応の工数を削減できるかを 3 か月で見極める",
        "assumption": "例: 問い合わせの 7 割は定型で、AI で正しく分類できる",
        "criterion": "例: 分類の正解率 85% 以上（300 件の検証セット）",
        "task": "例: 過去問い合わせ 300 件に正解ラベルを付ける",
        "evidence": "例: 検証セット 300 件で正解率 82%",
    },
    "weights": {"alignment": 0.40, "validation": 0.25, "schedule": 0.20, "waste": 0.15},
    "prompt_guidance": (
        "PoC は「仮説を検証して続行／撤退を判断する」ことが目的です。本番品質の作り込みは原則不要です。\n"
        "- 仮説の検証や成功条件の測定に直接必要な作業（検証データ作成、計測、最小限のプロトタイプ）は高く評価する。\n"
        "- UI の磨き込み、多言語対応、ダークモード、汎用化・設定画面、外部連携オプションなど、"
        "成功条件の判定に不要な作り込みは unnecessary_candidate とする。\n"
        "- 当初の目的・仮説と別の課題を解こうとしている作業は drift とする。"
    ),
}

_PLANNING = {
    "id": Mode.PLANNING,
    "name": "企画",
    "description": "新しい施策・サービス・イベントなどを企画し、決裁やリリースまで進める取り組み",
    "labels": {
        "goal": "企画の狙い",
        "assumption": "前提・想定ニーズ",
        "criterion": "KPI・達成基準",
        "deadline": "決裁・リリース期限",
        "task": "タスク",
        "evidence": "根拠資料・調査結果",
        "decision_continue": "Go",
        "decision_pivot": "修正",
        "decision_stop": "見送り",
    },
    "card_labels": {
        "drift": "狙いから逸脱の疑い",
        "drift_hint": "企画の狙いと作業内容にズレ",
        "unnecessary": "不要作業候補",
        "unnecessary_hint": "KPI・達成基準に紐づかない作業",
        "deadline_risk": "期限リスク",
        "deadline_risk_hint": "基準達成前に期限が到来見込み",
        "untested": "根拠のない前提",
        "untested_hint": "根拠資料がまだない前提",
        "weak_tasks_title": "狙いとの紐づきが弱いタスク TOP5",
        "under_evidenced_title": "根拠が不足している前提 TOP5",
    },
    "placeholders": {
        "title": "例: 新卒向けオンボーディング施策",
        "goal": "例: 新卒の配属後 3 か月以内の離職を減らす施策を来期予算で通す",
        "assumption": "例: 離職理由の上位は「相談相手がいない」である",
        "criterion": "例: 決裁会議で承認される／試行部署の満足度 4.0 以上",
        "task": "例: 過去 3 年の退職面談記録を集計する",
        "evidence": "例: 退職面談 42 件中 18 件が相談相手不在を理由に挙げた",
    },
    "weights": {"alignment": 0.40, "validation": 0.20, "schedule": 0.25, "waste": 0.15},
    "prompt_guidance": (
        "企画は「狙いを実現する案を、根拠を持って決裁・実行まで進める」ことが目的です。\n"
        "- 前提・想定ニーズの裏付け（調査、ヒアリング、データ集計）や、KPI 達成・決裁に必要な資料作成は高く評価する。\n"
        "- 決裁や KPI に影響しない資料の装飾、狙いと関係の薄い追加アイデアの深掘りは unnecessary_candidate とする。\n"
        "- 企画の狙いと別の課題に向かっている作業は drift とする。"
    ),
}

_IMPROVEMENT = {
    "id": Mode.IMPROVEMENT,
    "name": "業務改善",
    "description": "既存業務の課題の原因を特定し、施策を打って指標を改善する取り組み",
    "labels": {
        "goal": "改善目的",
        "assumption": "原因仮説",
        "criterion": "目標指標",
        "deadline": "期限",
        "task": "施策",
        "evidence": "計測結果",
        "decision_continue": "継続",
        "decision_pivot": "変更",
        "decision_stop": "中止",
    },
    "card_labels": {
        "drift": "目的逸脱の疑い",
        "drift_hint": "改善目的と施策内容にズレ",
        "unnecessary": "効果の薄い施策候補",
        "unnecessary_hint": "目標指標に紐づかない施策",
        "deadline_risk": "期限リスク",
        "deadline_risk_hint": "指標達成前に期限が到来見込み",
        "untested": "未検証の原因仮説",
        "untested_hint": "計測結果がまだない原因仮説",
        "weak_tasks_title": "目的との紐づきが弱い施策 TOP5",
        "under_evidenced_title": "計測が不足している原因仮説 TOP5",
    },
    "placeholders": {
        "title": "例: 月次請求処理の締め日短縮",
        "goal": "例: 月次請求処理を 5 営業日から 3 営業日に短縮する",
        "assumption": "例: 遅れの主因は営業からの売上確定連絡の遅れである",
        "criterion": "例: 3 か月連続で 3 営業日以内に請求書を発行",
        "task": "例: 売上確定の締め時刻を営業部と合意する",
        "evidence": "例: 9 月は売上確定連絡の 4 割が締め後に到着",
    },
    "weights": {"alignment": 0.35, "validation": 0.25, "schedule": 0.20, "waste": 0.20},
    "prompt_guidance": (
        "業務改善は「原因を特定し、目標指標を改善する」ことが目的です。\n"
        "- 原因仮説の計測・検証、目標指標に直接効く施策は高く評価する。\n"
        "- 原因仮説と結びつかない対症療法、目標指標に影響しないツール導入や見た目の整備は unnecessary_candidate とする。\n"
        "- 改善目的と別の業務課題に手を広げている施策は drift とする。"
    ),
}

DEFAULT_MODES: dict[Mode, ModeDefinition] = {
    Mode(d["id"]): ModeDefinition.model_validate(d) for d in (_POC, _PLANNING, _IMPROVEMENT)
}
