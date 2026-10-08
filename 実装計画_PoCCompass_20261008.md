# 実装計画: PoC Compass Cloud（モード切替対応） (2026-10-08)

> 記載ルール: 「事実」は既存リポジトリで確認した内容。「推測」「未検証」「提案」は明示する。
> 2026-10-08 追記: 本計画に基づき実装・Azure 構築まで実施済み。**現在の仕様の正本は `docs/SPEC.md`、機能と検証状況は `docs/FEATURES.md`、手順は `docs/DEPLOY.md`。** 本書の 4 章以降は計画時点の提案として残す（実装と異なる箇所は 10 章）。

## 1. 目的 / 背景

- PoC は「進捗」は見えても、**当初の目的・仮説・成功条件からズレているか**が見えない。
  気づくと仮説と関係ない機能開発（UI パターン検証・多言語対応・ダークモード等）に工数が流れる。
- 目的・仮説・成功条件・期限・タスクを一元管理し、**各タスクが当初ゴールに本当に必要か**を AI が継続判定、
  逸脱・不要作業・期限リスク・未検証仮説を検知して、続行／軌道修正／撤退の**判断材料**を出す。
- PoC 専用にせず、**モード切替で「企画」など別種の取り組みにも同じ仕組みを使えるようにする**（4.2）。

## 2. スコープ

### やること
- 取り組み（PoC / 企画 / …）の設計登録: 目的・仮説・成功条件・期限。
- タスク・成果物・検証データの記録と、仮説／成功条件へのひも付け。
- AI 照合: タスクごとの目的整合スコア・逸脱判定・不要機能候補の抽出（理由つき）。
- ルール判定: 期限リスク、未検証の仮説。
- 健全度スコア（0〜100）と日次スナップショット（先月比）。
- ダッシュボード（添付イメージ準拠）と判断レポート（続行／軌道修正／撤退の材料）。
- **モード定義**: 用語・入力項目・AI プロンプト・スコア重みをモード単位で切替。初期は PoC・企画の 2 モード。
- ローカル**デモモード**（シードデータでダッシュボードを再現。提案・デモ用）。

### やらないこと
- **AI が続行／撤退を決めること**。AI は材料と根拠を出すだけで、判断は人が行う。
- 汎用タスク管理ツールの代替（ガントチャート、工数入力、担当アサイン、通知ワークフロー）。
- MVP（フェーズ1）では外部ツール連携（Planner / Backlog / Jira / Teams）を作らない（フェーズ3で検討）。
- 社外提供・マルチテナント化、モバイルアプリ。

## 3. 現状（事実）

新規プロジェクトのためコードは無い。流用元となる既存の型は以下（2026-10-08 確認）。

| 項目 | 内容 | 所在 |
|---|---|---|
| Functions + FastAPI | `FastAPI()` を `AsgiFunctionApp` で包み、`/api` ルーターに controller を登録 | `営業契約書/ContractToolFunc/function_app.py:21,53,63` |
| 層構成 | `app/controllers` / `services` / `repositories` / `models` / `core` / `config` | `営業契約書/ContractToolFunc/app/` |
| Cosmos 基底クラス | `AbcCosmos(container_name)` | `営業契約書/ContractToolFunc/app/repositories/abc_cosmos_base.py:70` |
| LLM クライアント | `AzureChatOpenAI`（langchain-openai）を `LLMManager` で生成 | `営業契約書/ContractToolFunc/app/core/llm.py:5` |
| デモモード | `DEMO_MODE=true` かつ Azure 外のときだけ有効 | `営業契約書/ContractToolFunc/app/demo.py:20` |
| プロンプトの Cosmos 管理 | prompts コンテナ＋未登録時シード | `TOMAS-AI-Tool/TomasFunc/app/repositories/prompt_repository.py` |
| フロント | Next.js ~14.2 / React 18 / Tailwind / lucide-react | `TOMAS-AI-Tool/TomasFront/package.json` |
| インフラ | Bicep（`infra/main.bicep`）。AI Foundry は Japan East、他は Japan West | `営業契約書/AZURE-INFRA.md` |

使用中ポート（CLAUDE.md）: Functions 7071 / 3000 / 3001 / 3100 / 4350 / 4360。

## 4. 方式

### 4.1 全体構成（提案）

```
ブラウザ ─ PocCompassFront (Next.js 14, App Service, Entra ID ログイン)
              │ REST /api/*
              ▼
           PocCompassFunc (Azure Functions Python + FastAPI)
              ├─ HTTP: CRUD・評価実行・レポート生成
              ├─ Timer: 日次の再評価・健全度スナップショット
              ├─→ Cosmos DB（取り組み・タスク・評価結果・モード定義・プロンプト）
              ├─→ AI Foundry（GPT デプロイ: タスク照合・レポート文章生成）
              └─→ Key Vault / Application Insights
```

- 既存ツールと同じ層構成・同じライブラリ（langchain-openai, azure-cosmos, azure-identity）に揃える。
- AI 呼び出しは Structured Output（JSON スキーマ指定）で受け、数値計算（健全度）は**AI に任せずコードで決定的に計算**する。

### 4.2 モード切替の設計（本計画の要）

**データ構造は共通の「汎用スロット」で 1 本化し、モードは「ラベル・入力項目・プロンプト・重み」の差し替えだけにする。**
モードごとに別スキーマを作ると、ダッシュボード・AI・集計がモード数だけ分岐するため採らない。

| 汎用スロット | PoC モード | 企画モード | （例）業務改善モード ※3つ目は未決 |
|---|---|---|---|
| goal | 目的 | 企画の狙い | 改善目的 |
| assumption | 仮説 | 前提・想定ニーズ | 原因仮説 |
| criterion | 成功条件 | KPI・達成基準 | 目標指標 |
| deadline | 期限 | 決裁／リリース期限 | 期限 |
| task | タスク・成果物 | タスク・成果物 | 施策 |
| evidence | 検証データ | 根拠資料・調査結果 | 計測結果 |
| decision | 続行／軌道修正／撤退 | Go／修正／見送り | 継続／変更／中止 |

- モード定義は Cosmos `mode_definitions` に JSON で持つ（ラベル、必須項目、ダッシュボードのカード名、健全度の重み、使うプロンプト ID）。
  → **コード変更なしでモードを追加できる**ことを目標にする（管理画面はフェーズ2）。
- 取り組みは作成時にモードを選ぶ（`project.mode`）。ヘッダーのモード切替は「一覧の絞り込み＋新規作成時の既定モード」として働く。
- 作成後のモード変更は許可する（スロット共通なのでデータは失われない。ラベルが変わるだけ）。

### 4.3 AI 判定と健全度（提案）

| 指標（PoC 表記） | 判定方法 | 出力 |
|---|---|---|
| 目的逸脱の疑い | AI: タスクと目的・仮説の照合 | 件数、タスク別スコア 0〜100・理由 |
| 不要機能候補 | AI: どの成功条件にもひも付かないタスク | 件数、候補一覧・理由 |
| 期限リスク | ルール: 期限までの残日数 × 未達成の成功条件・未完了タスク | 件数 |
| 未検証の仮説 | ルール: evidence が 0 件の仮説 | 件数、TOP5 |
| 健全度スコア | コード: 上記の重み付き合成（重みはモード定義） | 0〜100、先月比 |

- タスク評価の出力スキーマ（案）: `task_id, alignment_score, linked_assumption_ids[], linked_criterion_ids[], verdict(aligned|weak|drift|unnecessary_candidate), reason, suggested_action`
- 健全度の初期重み（案・要調整）: 目的整合 40 / 仮説検証進捗 25 / 期限リスク 20 / 不要作業比率 15。
- 誤検知対策: 各アラートに「妥当（無視）」「指摘どおり」の人のフィードバックを付け、保存する（精度改善の正解データにする）。
- コスト対策: タスク内容のハッシュを保存し、**変更のあったタスクだけ再評価**する。

### 4.4 Cosmos DB コンテナ（案）

| コンテナ | パーティションキー | 中身 |
|---|---|---|
| `projects` | `/id` | 取り組み本体（mode, goal, deadline, members, status） |
| `project_items` | `/projectId` | assumption / criterion / task / evidence を `type` で区別 |
| `evaluations` | `/projectId` | 評価実行ごとの結果（タスク別スコア・アラート・フィードバック） |
| `health_snapshots` | `/projectId` | 日次の健全度（先月比の算出元） |
| `mode_definitions` | `/id` | モード定義 |
| `prompts` | `/mode` | モード別プロンプト（TOMAS と同じ「未登録時シード」方式） |

- 1 取り組みの画面表示は `project_items` の単一パーティション読み取りで済む構成にする。

### 4.5 画面（案）

| パス | 画面 |
|---|---|
| `/` | 取り組み一覧（モード絞り込み、健全度、アラート件数） |
| `/projects/new` | 作成: モード選択 → 目的・仮説・成功条件・期限 |
| `/projects/[id]` | 健全度ダッシュボード（添付イメージ準拠） |
| `/projects/[id]/design` | 設計（目的・仮説・成功条件）の編集 |
| `/projects/[id]/tasks` | タスク・成果物・検証データの記録とひも付け |
| `/projects/[id]/report` | 判断レポート（続行／軌道修正／撤退の材料） |
| `/admin/modes` | モード定義管理（フェーズ2） |

### 4.6 リポジトリ構成（案）

```
Desktop/PoCCompass/
  PocCompassFront/   Next.js（dev ポート 3200 を提案）
  PocCompassFunc/    Functions + FastAPI（func start --port 7072 を提案）
  infra/             main.bicep / modules / parameters
  docs/
```

### 採らなかった案
- **モードごとに別スキーマ／別画面**: 分岐が増え、モード追加のたびに実装が必要になる。
- **健全度スコアも AI に出させる**: 日によって値が揺れ、先月比が意味を持たない。
- **Static Web Apps でフロント配信**: 既存ツールが App Service 運用のため、運用手順を揃える（事実: `営業契約書/AZURE-INFRA.md`）。

## 5. 変更対象（新規作成）

| ファイル | 内容 |
|---|---|
| `PocCompassFunc/function_app.py` | FastAPI + ルーター登録 + Timer トリガー |
| `PocCompassFunc/app/controllers/` | `projects.py` `items.py` `evaluations.py` `reports.py` `modes.py` |
| `PocCompassFunc/app/services/` | `alignment_evaluator.py`（AI 照合）`health_score.py`（決定的計算）`report_generator.py` `mode_service.py` |
| `PocCompassFunc/app/repositories/` | 4.4 の各コンテナ（`AbcCosmos` 型を踏襲） |
| `PocCompassFunc/app/core/llm.py` | Foundry 接続（既存 `LLMManager` 型） |
| `PocCompassFunc/app/demo.py` + `seed/` | デモモードとシードデータ（PoC・企画 各 1 件以上） |
| `PocCompassFront/app/` | 4.5 の各画面、`ModeProvider`（ラベル解決） |
| `PocCompassFront/lib/api/` | API クライアントと型（バックエンドのモデルと突き合わせ） |
| `infra/main.bicep` | App Service / Functions / Cosmos / Foundry / Key Vault / App Insights / Storage |

## 6. 手順

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| 0. 雛形 | リポジトリ作成、Front/Func 雛形、ローカル起動、デモモード＋シードで**ダッシュボード画面**を再現 | ローカルで添付イメージ相当の画面が表示される |
| 1. MVP | 取り組み・設計・タスクの CRUD、モード 2 種（PoC/企画）、AI 照合（「AIで評価」ボタン）、ルール判定、健全度 | 実データ相当の 1 件で評価→ダッシュボード反映まで通る |
| 2. 継続監視 | Timer で日次再評価＋スナップショット（先月比）、判断レポート生成、アラートのフィードバック、モード管理画面 | 日次実行の結果が履歴に残り、レポートが出力できる |
| 3. Azure 化・連携 | Bicep デプロイ、Entra ID ログイン、メンバー権限、（任意）週報・議事録貼り付けからのタスク抽出、外部ツール取込 | Azure 上で社内ユーザーがログインして利用できる |

- 各フェーズの所要日数は**未見積り**（未決事項の回答後に見積る）。
- 着手時の参照スキル: `repo-recon` → `azfunc-backend` / `nextjs-front` / `ui-design` → `azure-infra` → 完了前 `verify-before-done`。

## 7. 影響範囲 / リスク

| 内容 | 影響 | 対策 |
|---|---|---|
| AI の誤判定（逸脱でないものを逸脱と判定） | アラート疲れで使われなくなる | 理由の必須表示、閾値をモード定義で調整、フィードバック収集→回帰セット化 |
| タスクの入力負荷 | 記録されなければ判定できない | 入力項目を最小化、一括貼り付け、（フェーズ3）週報からの自動抽出 |
| PoC 情報の機密性 | 社外流出リスク | 社内テナントの Foundry のみ使用、Key Vault／マネージド ID、Entra ID 必須 |
| LLM コスト | 取り組み数×タスク数に比例 | 変更タスクのみ再評価、日次バッチ、モデルは評価で選定 |
| ポート競合 | 既存ツールと同時起動できない | 3200 / 7072 を割当（提案） |
| 新規 Azure リソース | 費用・権限申請が必要 | リソースグループ・サブスクリプションを未決事項で確定 |

## 8. 検証方法

- **Backend**: `pytest`（健全度計算・ルール判定・モード定義の解決は決定的なので単体テストで担保）。
- **Frontend**: `npm run build`（型チェック込み）、主要画面をブラウザで実操作確認。
- **AI 照合の精度**: 人手でラベル付けしたタスク 30 件程度の回帰セット（PoC・企画 両方）を作り、
  verdict の一致率を計測。プロンプト変更時は前後比較する（`doc-ai-accuracy` の手順）。目標値は未決。
- **モード切替**: 同じ取り組みを PoC↔企画で切り替え、ラベル・カード名・プロンプトが切り替わりデータが欠けないこと。
- **Azure**: `az bicep build` → `what-if` → デプロイ → 本番 URL で評価実行が通ること。

## 9. 決定事項（2026-10-08 ユーザー回答）

| 論点 | 決定 |
|---|---|
| モード | PoC・企画・業務改善の 3 つ |
| モードの単位 | 取り組みごとに選ぶ（一覧は絞り込み） |
| Azure の置き場所 | 新規 RG `poc-compass-rg`（サブスクリプション「ICC GAIN検証用」） |
| 構築範囲 | 全リソースを Bicep で作成しデプロイまで |
| 認証 | Entra ID（App Service 認証） |
| 用途 | 社内で実際に使う機能・アプリ |
| 追加要望 | AI とチャットで対話しながら、いつでも内容を追加・修正できるようにする（→ SPEC §11） |
| ハーネス | ぶれないための仕組みを入れる（→ docs/HARNESS.md） |

### 未決（判断者: ユーザー）

| 論点 | 選択肢 |
|---|---|
| 精度の目標値 | 回帰セット（人手ラベル）を作って一致率 ○% 以上を目標にするか |
| タスクの外部連携 | Planner / Backlog / Excel 取込を作るか（現状は手入力・貼り付け取込・チャット） |
| 管理者の追加 | `ADMIN_EMAILS` に誰を入れるか（現状はデプロイ実行者のみ） |

## 10. 計画からの変更点

| 計画 | 実装 | 理由 |
|---|---|---|
| ポート 3200 / 7072 | 同じ | — |
| App Service も Japan East | Web / Functions は Japan West | Japan East の App Service VM クォータが上限（4/4） |
| プロンプトを `prompts` コンテナで管理 | モード定義（`mode_definitions`）の `prompt_guidance` に統合 | モードごとの差分だけを管理画面で編集できるようにした |
| Cosmos / AI はキーを Key Vault に保管 | キー認証を無効化し、マネージド ID（Entra ID）のみ | シークレットを減らすため |
| AI 呼び出しは langchain | openai SDK を直接使用 | Structured Outputs と依存の軽さ |
| — | AI チャット（提案→人が適用）を追加 | ユーザー追加要望 |
