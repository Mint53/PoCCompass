# ハーネス（ぶれないための仕組み）

AI エージェント（Claude Code / Codex）と人が交互に手を入れても、仕様・型・品質がずれないようにする仕組みの一覧。
「ルールを書く」だけでなく、**機械的に検査して止める**ところまでを用意している。

## 1. 正本を 1 か所に決める

| ずれやすいもの | 正本 | ずれたら誰が止めるか |
|---|---|---|
| 数値・閾値・重み・モードのラベル | `docs/SPEC.md` | `tests/test_spec_sync.py`（SPEC の表・数値とコードを突き合わせる） |
| Cosmos のコンテナ | `app/constants/enums.py` | `tests/test_spec_sync.py`（Bicep との突き合わせ） |
| バックエンドとフロントの API 型 | FastAPI のモデル | `scripts/check.sh` の API contract（openapi.json と schema.d.ts が最新か） |
| 機能の範囲と受け入れ条件 | `docs/FEATURES.md` | 人のレビュー（変更時は先に更新） |

## 2. 完了の定義を 1 本のコマンドにする

`scripts/check.sh`（約 40 秒）:

1. ruff（Python lint）
2. pytest（仕様由来の単体テスト・API 結合テスト・SPEC 同期テスト。AI は `FakeLlm` で決定的に）
3. API contract（OpenAPI と TypeScript 型が最新か）
4. tsc（型）
5. next lint（画面から fetch 直書き・alert 禁止などのルールを ESLint で強制）
6. シークレットが git 管理下にないか

`--full` で `next build` と `az bicep build` も実行。

## 3. フック（人が忘れても機械が止める）

| タイミング | 仕組み | 動作 |
|---|---|---|
| Claude が .py を編集した直後 | `.claude/settings.json` PostToolUse → `scripts/hooks/post-edit.sh` | その場で ruff。違反は exit 2 でエージェントに差し戻す |
| モデル／ルートを編集した直後 | 同上 | 「`scripts/gen-api.sh` を実行」と文脈に注入 |
| SPEC.md を編集した直後 | 同上 | 「コードとテストを SPEC に合わせる」と注入 |
| Claude が作業を終えようとしたとき | Stop → `scripts/hooks/stop-check.sh` | 前回成功後にソースが変わっていれば `check.sh` を実行。失敗なら exit 2 で**作業を続行させる** |
| git commit | `scripts/hooks/pre-commit`（`git config core.hooksPath scripts/hooks`） | シークレットらしき差分・ファイルを拒否し、`check.sh` が通らなければ拒否 |

※ `.claude/settings.json` のフックは **PoCCompass フォルダを開いて開始した Claude Code セッション**で有効になる。

## 4. AI 出力の揺れを吸収する

- すべての AI 呼び出しは Structured Outputs（JSON Schema 強制）。
- verdict とスコアの矛盾、存在しない ID、別名（A1/C2）の残りはコード側で正規化（SPEC §4.3）。
- 数値は AI に計算させない（SPEC §5）。
- プロンプトは `app/services/prompts.py` / `chat_prompts.py` のみに置く。変更したら下の「精度確認」を行う。

### 精度確認（プロンプト変更時）

自動テストは FakeLlm なので、**実 AI の判定の質は自動テストで担保されない**。変更時は次を手で確認する:

1. ローカルで `./scripts/dev-func.sh` と `npm run dev` を起動
2. 実データ相当の取り組み（目的・仮説 3・成功条件 2・タスク 7 程度。うち明らかに目的外のもの 2〜3）で「AI で評価」
3. 目的外タスクが drift / unnecessary_candidate、検証に直結するタスクが aligned になることを確認し、結果を `docs/FEATURES.md` の検証記録に残す

## 5. 既知の落とし穴（この PC / この構成）

| 症状 | 原因 | 対処 |
|---|---|---|
| 初回の AI 呼び出しが 45〜60 秒かかる／1 度ハングした | `DefaultAzureCredential` が資格情報の候補を順に試していた | `app/core/credentials.py` で Azure はマネージド ID、ローカルは `az login` に固定（初回 6 秒、2 回目以降 3 秒程度に短縮。2026-10-08 計測） |
| `func azure functionapp publish` が SSL エラー | 社内 SSL 検査を Core Tools が信頼しない | `scripts/deploy.sh api` は zip ＋ `az functionapp deployment source config-zip --build-remote` を使う |
| AI 呼び出しが 401 | PC の環境変数 `AZURE_OPENAI_API_KEY`（別用途）が優先されていた | このアプリはキーを読まない（Entra ID のみ）。ロール付与直後の 401 は数分待つ |
| func start 後、リクエスト時に `No module named azure.identity` | Core Tools がグローバル Python を使っていた | `scripts/dev-func.sh` を使う（VIRTUAL_ENV と実行パスを固定） |
| ルートテンプレート `api//{*route}` で起動失敗 | host.json の routePrefix と FastAPI の /api が二重 | host.json の `routePrefix` は空文字（変更しない） |
| `next dev` が数分で落ちる | dev と build が `.next` を共有していた | dev は `.next-dev` に出力（next.config.mjs） |
| `.localdata` の書き込みで WinError 5 | ウイルス対策等が一瞬ファイルをロック | `LocalFileStore` がリトライする（開発専用ストア） |
| pip が SSL エラー | 社内 SSL 検査 | `pip install --use-feature=truststore ...` |
