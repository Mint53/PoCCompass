# ruff: noqa: E501
"""Sample content, one fully filled-in project per mode (SPEC §17). Pure data: no logic, no branching on mode.

Day offsets are relative to the day the samples are created. `a` / `c` in a task are 0-based indexes into the
project's assumptions / criteria. `assumption` in evidence is an index into assumptions.
"""

from __future__ import annotations

from app.constants.enums import Mode

SAMPLE_TITLE_PREFIX = "【サンプル】"

SAMPLES: dict[Mode, dict] = {
    Mode.POC: {
        "title": "問い合わせ自動分類 PoC",
        "goal": "問い合わせ一次対応の工数を AI の自動分類で削減できるかを 3 か月で見極める。",
        "start": -30, "deadline": 60,
        "assumptions": [
            {"text": "問い合わせの 7 割は定型文で、パターン化できる", "priority": "high"},
            {"text": "AI で 85% 以上の正解率で分類できる", "priority": "high"},
            {"text": "分類結果を担当者が信頼して使ってくれる", "priority": "medium"},
        ],
        "criteria": [
            {"text": "分類の正解率が 85% 以上（300 件の検証セット）", "target": "85%"},
            {"text": "一次対応の所要時間が 30% 以上減る", "target": "-30%"},
        ],
        "tasks": [
            {"title": "過去の問い合わせ 300 件に正解ラベルを付ける", "status": "done", "start": -28, "due": -14, "hours": 16, "a": [0], "c": [0]},
            {"title": "分類プロンプトの試作と精度測定", "status": "doing", "start": -12, "due": 5, "hours": 12, "a": [1], "c": [0]},
            {"title": "担当者 5 名へのヒアリング", "status": "todo", "start": 3, "due": 14, "hours": 6, "a": [2], "c": [1]},
            {"title": "作業時間の計測シートを作る", "status": "todo", "start": 5, "due": 12, "hours": 4, "a": [], "c": [1]},
            {"title": "管理画面のダークモード対応", "status": "todo", "start": None, "due": 40, "hours": 10, "a": [], "c": []},
            {"title": "多言語（英語）の問い合わせ対応", "status": "todo", "start": None, "due": 50, "hours": 20, "a": [], "c": []},
        ],
        "evidence": [
            {"assumption": 0, "result": "supports", "summary": "ラベル付けの結果、300 件中 212 件（約 7 割）が定型パターンに該当", "source": "ラベル付けシート"},
            {"assumption": 1, "result": "inconclusive", "summary": "試作プロンプトの正解率は 82%。誤分類は「請求」と「契約」の取り違えが多い", "source": "検証セット 300 件"},
        ],
        "requests": [
            {"kind": "request", "title": "分類結果に理由を表示してほしい", "description": "なぜその分類になったのか担当者が確認できると安心できる。", "requester": "サポート 佐藤", "priority": "high", "action": "needed", "reason": "仮説 3（信頼して使える）の検証に直結するため"},
            {"kind": "issue", "title": "過去の問い合わせ履歴にラベルのゆれがある", "description": "同じ内容でも担当者によって分類名が違う。", "requester": "サポート 鈴木", "priority": "medium", "action": "needed", "reason": ""},
            {"kind": "request", "title": "管理画面の配色を変えたい", "description": "", "requester": "営業 田中", "priority": "low", "action": "not_needed", "reason": "PoC の成功条件に関係しないため見送り"},
        ],
        "asis": [
            {"no": "1", "assignee": "お客様", "content": "問い合わせフォームから送信する"},
            {"no": "2", "assignee": "サポート担当", "content": "内容を読んで分類（請求・契約・不具合 など）を判断する"},
            {"no": "3", "assignee": "サポート担当", "content": "担当チームのキューに手で振り分ける"},
            {"no": "4", "assignee": "専門チーム", "content": "回答を作成して返信する"},
        ],
        "tobe": [
            {"no": "1", "assignee": "お客様", "content": "問い合わせフォームから送信する"},
            {"no": "2", "assignee": "AI", "content": "内容を自動で分類し、理由を付けて担当キューに振り分ける"},
            {"no": "3", "assignee": "サポート担当", "content": "分類結果を確認し、誤りだけ直す", "next": ["4"]},
            {"no": "4", "assignee": "専門チーム", "content": "回答を作成して返信する"},
        ],
    },
    Mode.PLANNING: {
        "title": "新入社員フォロー施策の企画",
        "goal": "新卒の配属後 3 か月以内の離職を減らす施策を、来期予算で承認してもらう。",
        "start": -20, "deadline": 70,
        "assumptions": [
            {"text": "配属後 3 か月の孤立感が離職の主な要因になっている", "priority": "high"},
            {"text": "月 1 回の 1on1 を設ければ孤立感が減る", "priority": "high"},
            {"text": "現場の管理職が 1on1 の時間を確保できる", "priority": "medium"},
        ],
        "criteria": [
            {"text": "経営会議で施策と予算が承認される", "target": "来期予算に計上"},
            {"text": "試行部署の満足度アンケートが 4.0 以上", "target": "4.0 / 5"},
        ],
        "tasks": [
            {"title": "過去 3 年の退職者へのヒアリング", "status": "done", "start": -18, "due": -6, "hours": 14, "a": [0], "c": []},
            {"title": "他社の新人フォロー事例を調べる", "status": "doing", "start": -8, "due": 6, "hours": 8, "a": [1], "c": []},
            {"title": "1on1 の進め方ガイドを作る", "status": "todo", "start": 7, "due": 20, "hours": 10, "a": [1, 2], "c": [1]},
            {"title": "経営会議用の企画書を作成する", "status": "todo", "start": 15, "due": 35, "hours": 20, "a": [], "c": [0]},
            {"title": "社内ポータルのデザインを一新する", "status": "todo", "start": None, "due": 45, "hours": 30, "a": [], "c": []},
        ],
        "evidence": [
            {"assumption": 0, "result": "supports", "summary": "ヒアリング 12 名中 8 名が「相談相手がいなかった」と回答", "source": "退職者ヒアリング"},
            {"assumption": 2, "result": "refutes", "summary": "管理職アンケートで 6 割が「月 1 回の 1on1 は時間的に難しい」と回答", "source": "管理職アンケート"},
        ],
        "requests": [
            {"kind": "request", "title": "メンター制度も併せて検討してほしい", "description": "1on1 だけでなく、年次の近い先輩に相談できる仕組みが欲しい。", "requester": "人事 高橋", "priority": "medium", "action": "undecided", "reason": ""},
            {"kind": "issue", "title": "管理職が 1on1 の時間を確保できない", "description": "繁忙期は月 1 回でも難しいという声が多い。", "requester": "営業部長", "priority": "high", "action": "needed", "reason": "仮説 3 が否定されたため、頻度や形式を見直す必要がある"},
            {"kind": "request", "title": "社内ポータルのデザイン刷新", "description": "", "requester": "総務", "priority": "low", "action": "not_needed", "reason": "今回の企画の狙いと別件"},
        ],
        "asis": [
            {"no": "1", "assignee": "人事", "content": "入社時に研修を実施する"},
            {"no": "2", "assignee": "配属先の上長", "content": "OJT を任せる（進め方は上長次第）"},
            {"no": "3", "assignee": "新入社員", "content": "困ったときは自分から相談する"},
        ],
        "tobe": [
            {"no": "1", "assignee": "人事", "content": "入社時に研修を実施する"},
            {"no": "2", "assignee": "配属先の上長", "content": "月 1 回の 1on1 を実施し、記録を残す"},
            {"no": "3", "assignee": "人事", "content": "1on1 の記録から孤立のサインを確認する", "next": ["4", "5"]},
            {"no": "4", "assignee": "人事", "content": "サインがあれば本人と上長にフォローを入れる"},
            {"no": "5", "assignee": "人事", "content": "四半期ごとに満足度アンケートを集計する"},
        ],
    },
    Mode.IMPROVEMENT: {
        "title": "月次請求処理のリードタイム短縮",
        "goal": "月次請求処理を 5 営業日から 3 営業日に短縮する。",
        "start": -25, "deadline": 65,
        "assumptions": [
            {"text": "遅れの主因は、売上データの手作業での突き合わせである", "priority": "high"},
            {"text": "突き合わせを自動化すれば 1.5 日短縮できる", "priority": "high"},
            {"text": "承認待ちの滞留が、残りの遅れの原因になっている", "priority": "medium"},
        ],
        "criteria": [
            {"text": "月次請求処理が 3 営業日以内に完了する", "target": "3 営業日"},
            {"text": "請求書の修正（差し戻し）が月 2 件以下", "target": "2 件 / 月"},
        ],
        "tasks": [
            {"title": "現行の請求処理の作業時間を計測する", "status": "done", "start": -23, "due": -10, "hours": 12, "a": [0], "c": []},
            {"title": "突き合わせ作業の自動化ツールを試作する", "status": "doing", "start": -9, "due": 10, "hours": 24, "a": [1], "c": [0]},
            {"title": "承認フローの待ち時間を調べる", "status": "todo", "start": 8, "due": 18, "hours": 6, "a": [2], "c": [0]},
            {"title": "差し戻しの原因を分類する", "status": "todo", "start": 12, "due": 25, "hours": 8, "a": [], "c": [1]},
            {"title": "請求書のレイアウトを刷新する", "status": "todo", "start": None, "due": 40, "hours": 10, "a": [], "c": []},
        ],
        "evidence": [
            {"assumption": 0, "result": "supports", "summary": "計測の結果、5 日のうち 2.3 日が売上データの突き合わせだった", "source": "作業時間の計測"},
            {"assumption": 1, "result": "inconclusive", "summary": "試作ツールで 1 部門を試したところ 0.8 日短縮。他部門のデータ形式は未確認", "source": "試作ツールの試行"},
        ],
        "requests": [
            {"kind": "issue", "title": "月次集計に 3 日かかる", "description": "売上データを手作業で突き合わせており、締め日に間に合わないことがある。", "requester": "経理 山田", "priority": "high", "action": "needed", "reason": "リードタイム短縮の主因のため"},
            {"kind": "request", "title": "請求書にバーコードを付けたい", "description": "入金消込を自動化したい。", "requester": "経理 中村", "priority": "medium", "action": "undecided", "reason": ""},
            {"kind": "request", "title": "請求書のレイアウトを一新したい", "description": "", "requester": "営業 小林", "priority": "low", "action": "not_needed", "reason": "リードタイムに影響しないため今回は対象外"},
        ],
        "asis": [
            {"no": "1", "assignee": "各部門", "content": "月末に売上データを経理へ送る"},
            {"no": "2", "assignee": "経理", "content": "売上データを Excel で受注データと突き合わせる"},
            {"no": "3", "assignee": "経理", "content": "請求書を作成する", "next": ["4"]},
            {"no": "4", "assignee": "経理課長", "content": "請求書を確認・承認する", "next": ["5", "3"]},
            {"no": "5", "assignee": "経理", "content": "請求書を発送する"},
        ],
        "tobe": [
            {"no": "1", "assignee": "システム", "content": "売上データを自動で取り込み、受注データと突き合わせる"},
            {"no": "2", "assignee": "経理", "content": "突き合わせの差異だけを確認する"},
            {"no": "3", "assignee": "システム", "content": "請求書を自動で作成する"},
            {"no": "4", "assignee": "経理課長", "content": "請求書を確認・承認する（当日中）", "next": ["5", "3"]},
            {"no": "5", "assignee": "システム", "content": "請求書を自動で発送する"},
        ],
    },
}
