# PoC Compass — 仕様書（正本）

> **この文書が仕様の正本。** コード・テスト・画面がこの文書と食い違ったら、どちらが正しいかを確認し、
> 仕様を変えるなら**先にこの文書を更新してから**コードを直す。数値・閾値はすべてここに書く。

最終更新: 2026-10-08

---

## 1. 概念

| 用語 | 意味 |
|---|---|
| 取り組み (project) | 管理単位。PoC・企画・業務改善のいずれか 1 つのモードを持つ |
| モード (mode) | 用語・入力例・AI への指示・健全度の重みのセット。データ構造は全モード共通 |
| 汎用スロット | 全モード共通のデータ項目（2 章）。モードは表示名を差し替えるだけ |
| 評価 (evaluation) | AI がタスクを目的・仮説・成功条件と照合した結果 1 回分 |
| 健全度 (health) | 0〜100 の決定的スコア。**AI には計算させない**（5 章） |

## 2. 汎用スロットとモード

| スロット | PoC (`poc`) | 企画 (`planning`) | 業務改善 (`improvement`) |
|---|---|---|---|
| goal | 目的 | 企画の狙い | 改善目的 |
| assumption | 仮説 | 前提・想定ニーズ | 原因仮説 |
| criterion | 成功条件 | KPI・達成基準 | 目標指標 |
| deadline | 期限 | 決裁・リリース期限 | 期限 |
| task | タスク | タスク | 施策 |
| evidence | 検証データ | 根拠資料・調査結果 | 計測結果 |
| decision.continue | 続行 | Go | 継続 |
| decision.pivot | 軌道修正 | 修正 | 変更 |
| decision.stop | 撤退 | 見送り | 中止 |

ダッシュボードのカード名もモードで変わる（`app/modes/defaults.py` が既定値の正本）。
モード定義は Cosmos `mode_definitions` に保存され、未登録なら既定値をシードする。管理者は画面から編集できる。

- 取り組みは作成時にモードを 1 つ選ぶ。作成後の変更も可（データは共通なので失われない）。
- 一覧画面のモード切替は「絞り込み」と「新規作成時の既定モード」。

## 3. データモデル

### 3.1 project（コンテナ `projects`, PK `/id`）

| フィールド | 型 | 必須 | 備考 |
|---|---|---|---|
| id | str (uuid) | ○ | |
| mode | `poc` / `planning` / `improvement` | ○ | |
| title | str (1〜100) | ○ | |
| goal | str (1〜2000) | ○ | |
| start_date | date | ○ | 既定は作成日 |
| deadline | date | ○ | start_date 以降 |
| status | `active` / `stopped` / `completed` | ○ | 撤退の判断を記録すると `stopped` |
| owner_email | str | ○ | 作成者 |
| members | list[str] | ○ | **編集者**。owner を含むメールアドレス（小文字化して保存） |
| viewers | list[str] | 既定 `[]` | **閲覧者**（閲覧のみ）。members と重複した場合は members（編集者）が優先。既存データに無くても `[]` として扱う |
| deleted | bool | ○ | 論理削除。物理削除はしない |
| created_at / updated_at | datetime (UTC ISO8601) | ○ | |

### 3.2 items（コンテナ `project_items`, PK `/projectId`）

全 item 共通: `id, projectId, type, created_at, updated_at, created_by`

| type | フィールド |
|---|---|
| `assumption` | text, status: `untested`/`testing`/`supported`/`rejected`, priority: `high`/`medium`/`low` |
| `criterion` | text, target (任意: 目標値の文字列), status: `not_met`/`met` |
| `task` | title, description, status: `todo`/`doing`/`done`, effort_hours (任意, >0), start_date (任意。WBS の帯の開始。due_date 以前), due_date (任意), linked_assumption_ids, linked_criterion_ids（人が付けたひも付け） |
| `evidence` | assumption_id, summary, result: `supports`/`refutes`/`inconclusive`, source (任意) |
| `feedback` | task_id, content_hash, judgement: `agree`/`dismiss` |
| `decision` | decision: `continue`/`pivot`/`stop`, note |

- assumption / criterion を削除したら、task の linked_*_ids と evidence から参照を外す（evidence は削除）。

### 3.3 evaluations（コンテナ `evaluations`, PK `/projectId`）

`id, projectId, created_at, trigger: manual|scheduled, model, design_hash, task_results[]`

task_result: `task_id, content_hash, alignment_score (0-100 int), verdict, linked_assumption_ids, linked_criterion_ids, reason, suggested_action, reused (bool)`

### 3.4 health_snapshots（PK `/projectId`）

`id = "{projectId}:{YYYY-MM-DD}"`, `date, score, components`。同日は上書き。

### 3.5 reports（PK `/projectId`）

`id, projectId, created_at, created_by, model, health_score, content{...}`（7 章）

### 3.6 mode_definitions（PK `/id`）

`id (= mode), name, description, labels{...}, card_labels{...}, placeholders{...}, weights{alignment,validation,schedule,waste}, prompt_guidance, updated_at, updated_by`

### 3.7 users（ユーザーマスタ。コンテナ `users`, PK `/id`）

取り組みのメンバーを検索して選ぶための名簿。**ログインの可否は決めない**（サインインは従来どおり同じテナントのユーザーなら可能）。

| フィールド | 型 | 必須 | 備考 |
|---|---|---|---|
| id | str | ○ | メールアドレス（小文字）。= email |
| email | str | ○ | 小文字化して保存。作成後は変更不可 |
| name | str (1〜50) | ○ | 表示名 |
| department | str (0〜50) | | 部署 |
| created_at / updated_at | datetime (UTC ISO8601) | ○ | |

- 管理者かどうかは `ADMIN_EMAILS` で決まり、マスタには保存しない（API の `is_admin` は表示用の導出値）。
- マスタから削除しても、すでに取り組みのメンバーになっている人のアクセスは変わらない（検索に出なくなるだけ）。

## 4. AI 照合（タスク評価）

### 4.1 入力と出力

- 入力: モード名とラベル、goal、assumptions（id・本文・状態）、criteria（id・本文）、tasks（id・タイトル・説明・状態・人が付けたひも付け）。
- 1 回の AI 呼び出しで最大 **5 タスク**。超える場合は分割し、最大 4 並列（7 タスク 1 回で約 58 秒かかったため、分割して並列化する）。
- 出力は JSON Schema 強制（Structured Outputs）。task ごとに:
  `task_id, alignment_score (0-100), verdict, linked_assumption_ids, linked_criterion_ids, reason (日本語 200 字以内), suggested_action (日本語 100 字以内)`

### 4.2 verdict の定義

| verdict | 意味 | スコア帯 |
|---|---|---|
| `aligned` | 仮説の検証または成功条件の達成に直接寄与する | 70〜100 |
| `weak` | 間接的には寄与するが、なくても検証・判定できる | 40〜69 |
| `drift` | **目的逸脱の疑い**: goal・仮説と別の目的に向かっている | 0〜39 |
| `unnecessary_candidate` | **不要機能候補**: 目的には関係するが、どの成功条件の判定にも不要な作り込み | 0〜59 |

### 4.3 コード側の正規化（AI の揺れを吸収する。`services/alignment_evaluator.py`）

1. score を 0〜100 の整数に丸める。
2. verdict と score の矛盾を直す:
   - `aligned` かつ score < 70 → `weak`
   - `weak` で score ≥ 70 → `aligned`、score < 40 → `drift`
   - `drift` で score ≥ 40 → `weak`
   - `unnecessary_candidate` で score ≥ 60 → `weak`
3. 存在しない assumption / criterion の id は捨てる。
4. reason / suggested_action に残った別名 ID（A1, C2 など）は「仮説1」「成功条件2」のように表示名＋番号へ置き換える（番号は登録順）。
5. 返ってこなかった task はエラー扱いにせず、その task を「未評価」として残す。

### 4.4 再評価の省略（コスト対策）

- `design_hash` = goal・assumptions・criteria の本文の SHA-256。
- `content_hash` = task の title・description・status・ひも付けの SHA-256。
- 前回評価と design_hash が同じで、task の content_hash が同じなら、AI を呼ばずに前回結果を再利用する（`reused=true`）。

### 4.5 評価結果の採用

- ダッシュボードは最新評価のうち、**task の現在の content_hash と一致する結果だけ**を使う。
  - 結果はあるが hash が違う task =「内容変更により再評価待ち」(`stale_task_ids`)
  - 結果が無い task =「未評価」(`unevaluated_task_ids`)
- 設計（goal・assumptions・criteria）が評価時から変わっていれば `design_changed=true` とし、画面で再評価を促す。

### 4.6 フィードバック

- `dismiss`（指摘は妥当でない）: 同じ content_hash の間、その task は drift / unnecessary の件数・TOP5・警告から除外する。
- task の内容が変われば content_hash が変わり、フィードバックは無効になる。

## 5. ルール判定と健全度（決定的。`services/metrics.py`）

基準日 `today` は JST の日付。

### 5.1 カード

| カード | 定義 |
|---|---|
| 目的逸脱の疑い | 最新評価で verdict=`drift` の task 数（dismiss 除外） |
| 不要機能候補 | verdict=`unnecessary_candidate` の task 数（dismiss 除外） |
| 期限リスク | 下の「期限リスク項目」の件数 |
| 未検証の仮説 | evidence が 0 件かつ status=`untested` の assumption 数 |

期限リスク項目:
- 期日 (due_date) を過ぎて未完了の task
- 取り組みが「遅延」状態のとき、未達成 (`not_met`) の criterion すべて

遅延状態 = `today > deadline` かつ未達成の criterion がある、または `elapsed - progress > 0.15`

- `elapsed` = (today − start_date) / (deadline − start_date)、0〜1 にクリップ（期間 0 日なら 1）
- `progress` = 0.5 × criterion 達成率 + 0.5 × task 完了率（どちらかが 0 件ならもう一方のみ。両方 0 件なら 0）

### 5.2 健全度の構成要素（各 0〜100）

| 要素 | 計算 |
|---|---|
| alignment（目的整合） | 評価済み task の alignment_score の加重平均。重み = effort_hours（未入力は 1）。dismiss 済みは 100 とみなす。評価済み task が 0 件なら **null** |
| validation（仮説検証） | assumption ごとの点数の平均。`supported`/`rejected` = 100、`testing` または evidence あり = 50、それ以外 0。assumption 0 件なら null |
| schedule（期限） | `today > deadline` かつ未達成あり → 0。それ以外は `100 − max(0, elapsed − progress) × 200` を 0〜100 にクリップ |
| waste（ムダの少なさ） | `100 − (drift + unnecessary の task の重み合計 / 評価済み task の重み合計) × 100`。評価済み 0 件なら null |

### 5.3 合成

`score = round( Σ(weight_k × component_k) / Σ(weight_k) )`。**null の要素は分子・分母から除外**する。
全要素 null なら score も null（画面は「未評価」）。

モード別の既定重み:

| モード | alignment | validation | schedule | waste |
|---|---|---|---|---|
| poc | 0.40 | 0.25 | 0.20 | 0.15 |
| planning | 0.40 | 0.20 | 0.25 | 0.15 |
| improvement | 0.35 | 0.25 | 0.20 | 0.20 |

### 5.4 先月比

最新スコア − 「30 日以上前で最も新しい snapshot」のスコア。該当 snapshot が無ければ null（「比較データなし」）。

### 5.5 TOP5

- 目的との紐づきが弱いタスク: 評価済み・dismiss 除外の task を alignment_score 昇順、上位 5。バーの長さ = `100 − alignment_score`（ズレ度）。
- 検証データが不足している仮説: status が `supported`/`rejected` 以外の assumption の不足度 = `max(0, 100 − 40 × 決定的 evidence 数 − 15 × inconclusive 数)`、優先度 high を先、不足度降順、上位 5。決定的 = supports / refutes。

## 6. 評価のタイミング

- 手動: 画面の「AIで評価」（`POST /api/projects/{id}/evaluations`）。同期実行。
- 定期: Timer トリガー 毎日 06:00 JST（`0 0 21 * * *` UTC）。status=`active` かつ未削除の全取り組みを評価し snapshot を保存。
- 評価を実行するたびに当日の snapshot を上書きする。

## 7. 判断レポート

- AI が「判断材料」を作る。**判断（続行/軌道修正/撤退）は人が決める**。AI に推奨を 1 つに絞らせない。
- 出力: `summary`, `highlights[]`, `options[3]{decision, supporting[], concerns[], conditions[]}`, `questions[]`, `next_actions[]`
- 入力: 設計・タスク・最新評価・5 章の指標。数値は AI に再計算させず、計算済みの値を渡す。
- 判断の記録は `decision` item として保存。`stop` を記録すると project.status=`stopped`。

## 8. タスク抽出（貼り付けからのタスク化）

- 週報・議事録などのテキスト（最大 8000 字）から task 候補を AI が抽出。**保存はしない**。
- 人が候補を選んで一括登録（`POST /items/bulk`）。

## 9. 認証・認可

- Azure: フロント Web App の App Service 認証（Entra ID）。Next.js サーバーがバックエンドを代理呼び出しし、
  `X-PocCompass-User-Email` / `X-PocCompass-User-Name` ヘッダーと Functions キーを付ける。
  ブラウザはバックエンドを直接呼ばない。
- バックエンドは HTTP auth level = FUNCTION。ユーザーヘッダーが無い要求は 401。
  ローカル（`WEBSITE_INSTANCE_ID` 未設定）のみ `DEV_USER_EMAIL` で代替する。
- 取り組みの**閲覧**: members（編集者）・viewers（閲覧者）に含まれるユーザー、または管理者（`ADMIN_EMAILS`）。それ以外は 404（存在を明かさない）。
- 取り組みの**編集**（項目の追加・変更・削除、AI 評価、判断レポートの作成、タスク抽出、フィードバック、チャット、取り組み情報の変更）: members（編集者）または管理者。閲覧者は 403（`FORBIDDEN`。「この取り組みは閲覧のみ可能です。…」）。
- メンバー（members / viewers）変更・削除・モード変更: owner または管理者。
- 閲覧者にできるのは、一覧・ダッシュボード・羅針盤・分析・WBS・設計・タスク・検証データ・判断レポートの**閲覧**だけ。画面は編集系の操作を出さない（API も 403 で拒否する）。
- メンバーに**新しく**加えるメールアドレスは、ユーザーマスタ（3.7）に登録済みであること。未登録は 400。すでにメンバーの人（作成者を含む）は未登録でも残せる。
- モード定義の編集: 管理者のみ。
- ユーザーマスタ（14 章）: 検索（`GET /users`）はサインイン済みなら誰でも可。追加・変更・削除は管理者のみ（403）。

## 10. エラー応答

`{"error": {"code": "<UPPER_SNAKE>", "message": "<日本語。何が起きたか＋次の行動>"}}`

| HTTP | code | 例 |
|---|---|---|
| 400 | VALIDATION_ERROR | 入力不正 |
| 401 | UNAUTHENTICATED | ユーザーヘッダー無し |
| 403 | FORBIDDEN | owner/管理者のみの操作、閲覧者による編集 |
| 404 | NOT_FOUND | 無い / 権限なし |
| 409 | CONFLICT | 既に登録されている（ユーザーマスタのメール重複） |
| 503 | AI_NOT_CONFIGURED | AI 接続設定なし |
| 502 | AI_FAILED | AI 呼び出し失敗（リトライ後） |

## 11. AI チャット（対話で内容を追加・修正する）

取り組みのどの画面からでも開けるチャット。AI は取り組みの現在の内容を把握したうえで、質問に答え、追加・修正・削除を**提案**する。

### 11.1 原則

- **AI はデータを直接書き換えない。** 変更は「提案（proposal）」として返し、人が「適用」を押したときだけ実行する（7 章と同じ「判断は人」）。
- 適用は既存の API と同じサービス関数を通す（権限・入力検証・連鎖削除の規則が同じに働く）。
- スレッドは**取り組み × ユーザー**ごと。他のメンバーの会話は見えない。

### 11.2 データ（コンテナ `chat_messages`, PK `/projectId`）

`id, projectId, user_email, role: user|assistant, content, created_at, proposal (assistant のみ・任意)`

proposal: `status: pending|applied|discarded|partially_applied, operations[]`

operation: `op: create|update|delete, target: assumption|criterion|task|evidence|project, item_id (update/delete), fields{}, summary (人が読む説明), error (検証エラー。あれば適用対象外), result: ok|failed|null, result_message`

### 11.3 AI に渡すもの / 受け取るもの

- 渡す: モード名とラベル、goal・期間、assumptions（A1…）、criteria（C1…）、tasks（T1…、最新の判定と整合スコア付き）、evidence（E1…）、健全度とカードの数値、このスレッドの直近 **20** 件。
- 受け取る（Structured Outputs）: `reply`（日本語の返答）、`operations[]`（op, target, ref, fields, reason）。
- 1 回の提案は最大 **20** 操作。対象は assumption / criterion / task / evidence の追加・更新・削除と、project の title / goal / start_date / deadline の更新。
  モード・メンバー・判断の記録・取り組みの削除はチャットからは行わない（設定画面・判断レポート画面で人が行う）。
- `ref` / `*_refs` の別名は提案作成時に実 ID へ解決する。存在しない別名を指す操作は error 付きで返す。
- reply に残った別名は 4.3 と同じ規則で表示名＋番号に置き換える（T → タスク名ラベル、E → 検証データラベル）。

### 11.4 API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/projects/{id}/chat` | 自分のスレッド（古い順、最大 100 件） |
| POST | `/api/projects/{id}/chat` | `{message}` を送信し、AI の返答（提案付き）を返す。メッセージは最大 **4000** 字 |
| POST | `/api/projects/{id}/chat/{messageId}/apply` | pending の提案を適用。`{operation_indexes?: number[]}` で一部だけ適用できる |
| POST | `/api/projects/{id}/chat/{messageId}/discard` | 提案を破棄 |
| DELETE | `/api/projects/{id}/chat` | 自分のスレッドを消去（物理削除。個人の会話ログのため） |

## 12. 分析グラフと WBS（画面）

### 12.1 分析タブ（`/projects/{id}/analysis`）

ダッシュボード API（`GET /dashboard`）の値だけを描く。**画面側で件数・スコアを計算し直さない**（集計は `services/metrics.py`）。

- `verdict_counts`: 最新評価（task の現在の content_hash と一致する結果のみ）の判定別件数。`dismissed`（フィードバックで除外済み）は別枠。`pending` = 結果が無い／内容変更で再評価待ちの task 数。`aligned + weak + drift + unnecessary + dismissed + pending` = task 総数。
- `evidence_tally`: 仮説ごとの検証データ件数（`supports` / `refutes` / `inconclusive`）。登録順。
- 画面の内容: 判定の内訳（積み上げ横棒）、健全度の構成要素（レーダー）、期間の経過と進捗、検証データの結果（仮説ごとの積み上げ棒）。色だけに頼らず、数値と凡例を必ず併記する。

### 12.2 WBS タブ（`/projects/{id}/wbs`）

- 表示するデータは task の `start_date` / `due_date` / `status` / ひも付け。AI は使わない。
- 横軸 = 取り組みの `start_date`〜`deadline`（task の日付が範囲外ならその分だけ軸を広げる）。今日の線を引く。
- 帯 = `start_date`〜`due_date`。`start_date` 無しは `due_date` のみの 1 日帯、両方無しは「日程未設定」として帯なしで下に並べる。
- 遅延 = `due_date < today` かつ未完了（5.1 の期限リスクと同じ条件）。帯を赤枠にし、文言でも示す。
- 並び = 仮説にひも付く task は仮説ごとにまとめ、どれにも付かない task は「ひも付けなし」にまとめる。複数の仮説に付く task は最初の仮説の下に表示する。

### 12.3 画面の収まり

ダッシュボード・羅針盤・分析・WBS・判断レポートの各画面は、ブラウザ全画面（ズーム 100%）で縦スクロールなしに収める。ヘッダーとタブを除いた残りの高さを使い、内容が溢れる場合はその領域の中だけをスクロールする（ページ全体は動かない）。

- ダッシュボード: 健全度カードは固定の高さ、その下の 4 枚（AI からの指摘・紐づきが弱いタスク・検証データ不足・期限リスク／推移）が残りの高さを分け合い、各カードの中でスクロールする。極端に低い画面では下段の最小高さ（13rem）を確保し、コンテンツ領域の中だけをスクロールする。
- 判断レポート: 左にレポート本文（要約と判断に効く事実を横に並べ、続行・軌道修正・撤退の 3 案を横並び）、右に判断の記録（入力と履歴）を置く。本文と履歴はそれぞれの枠の中でスクロールする。
- 画面幅が `lg`（1024px）未満では縦に積み、コンテンツ領域の中でスクロールする。
- 他の画面（タスク・検証データ・設計・設定）は対象外。

## 13. 羅針盤（画面）

目的からのズレを「位置」で見せる画面（`/projects/{id}/compass`）。**表示する値はすべて API（`GET /compass`）が決定的に計算したもの**で、画面側で件数・スコアを計算し直さない（AI は使わない。指摘の文章は 4 章の評価結果をそのまま出す）。

### 13.1 API（`GET /projects/{id}/compass`）

- `frames`: 評価の履歴。古い順で最大 **8** 枚。最後の 1 枚は常に「現在」（`is_current=true`）で、4.5 の採用ルール（content_hash 一致）で作る。それ以前は過去の評価結果そのまま（`created_at` の JST 日付で `health_snapshots` を引き、無ければ `health_score=null`）。評価が 1 度も無ければ「現在」の 1 枚だけ。
- `tasks`: task ごとに
  - `sector_id`: 最初に見つかる（存在する）仮説の id。どの仮説にも付かない task は `null`（12.2 のまとめ方と同じ）。
  - `points`: `frames` と同じ長さの配列。その時点の `{score, verdict}`。評価結果が無い（未評価・内容変更で再評価待ち）は `null`。
  - `needs_attention`: 現在 `drift` / `unnecessary_candidate` で、同じ content_hash の `dismiss` フィードバックが無い（= ダッシュボードの警告と同じ集合）。
  - `feedback`: 現在の content_hash に対する最新のフィードバック（`agree` / `dismiss` / `null`）。
  - `reason` / `suggested_action`: 現在の評価結果の文章（無ければ空文字）。
- `sectors`: 仮説（登録順）。`id, text, priority`。
- `attention_count` = `needs_attention` の件数（ダッシュボードの「目的逸脱の疑い」＋「不要機能候補」と一致する）。

### 13.2 画面

- 中心 = 目的。点 = task。**目的に近い（整合スコアが高い）ほど中心に寄る**。仮説ごとに扇形へ配置し、「ひも付けなし」を最後の扇形にする。未評価・再評価待ちは外周の点線の丸。
- 色は 3 種類だけ: 要確認（赤）／問題なし（藍）／未評価（点線）。色だけで伝えない（見出しの件数・右カードの文言・点の `aria-label` にも出す）。
- 見出しは「N 件が、目的からズレています」（0 件は「目的から、ぶれていません」）。健全度と先月比を小さく添える。
- 下部の時間軸で `frames` を切り替えられ、再生すると点が動く。過去の時点では判断操作を出さない。
- 右カードは「次に見ること」（`needs_attention` かつ `feedback=null` の最もスコアが低い task）。点をクリックすると、その task の理由・提案・操作を出す。操作は既存の 4.6 と同じ（**AI は直接データを書き換えない**）: 「指摘のとおり」（`agree`・記録のみ）／「当たらない」（`dismiss`・件数から除外）。
- 名前（task 名）は点に触れた・選んだときだけ出す。

## 14. ユーザーマスタとメンバー選択

### 14.1 API

| メソッド | パス | 権限 | 内容 |
|---|---|---|---|
| GET | `/users?q=&limit=` | サインイン済み | メールアドレス・氏名・部署の部分一致（大文字小文字を区別しない）。氏名順。`limit` 既定 **20**・最大 **500**。`q` 空は全件（先頭から `limit` 件） |
| POST | `/users` | 管理者 | `{email, name, department}`。既に同じメールがあれば 409 `CONFLICT` |
| PUT | `/users/{email}` | 管理者 | `{name, department}`。メールは変更不可。無ければ 404 |
| DELETE | `/users/{email}` | 管理者 | 無ければ 404。取り組みのメンバーは変更しない |
| GET | `/projects/{id}/members` | 閲覧できる人 | `[{email, name, department, role}]`。`role` = `owner` / `editor` / `viewer`。マスタに無い人は `name` = メールアドレス・`department` = 空 |

- 各ユーザーの応答は `email, name, department, is_admin, created_at, updated_at`。
- `PATCH /projects/{id}` の `members`（編集者）と `viewers`（閲覧者）で更新する（owner のみ。owner は常に members に含まれる）。

### 14.2 画面

- **ユーザー管理**（`/admin/users`、管理者のみ。ヘッダーに「ユーザー管理」を出す）: 検索欄、一覧表（氏名・メールアドレス・部署・管理者バッジ）、追加・編集ダイアログ、削除の確認ダイアログ。管理者以外が開くと権限なしの案内を出す。
- **メンバー選択**（取り組みの設定画面・新規作成画面で共通）: 現在のメンバーを「作成者／編集者／閲覧者」の表で出し、役割の切り替えと削除ができる。その上の検索欄にキーワードを入れるとユーザーマスタから候補を出し、「編集者として追加」「閲覧者として追加」で加える。メールアドレスの手入力はしない。作成者は変更・削除できない。
- 閲覧者が開いた取り組みは、編集系のボタン・入力を出さず（または無効にし）、画面上部に「閲覧のみ」を表示する。

## 15. マニュアル（画面）

- `/manual`。ヘッダーの「マニュアル」から、どの画面からでも・サインイン済みなら誰でも開ける。取り組みを開いていなくても見られる。
- 内容: 全体像／取り組みの作成／画面の見かた／タスクの登録と AI 評価／ダッシュボードと羅針盤の読みかた／指摘への対応／判断レポート／メンバーと権限／AI チャット／管理者向け／よくある質問。
- **モード依存の語（仮説・前提・原因仮説…）は直書きせず**、画面上部のモード切り替え（PoC・企画・業務改善）で選んだモードの `labels` / `card_labels` から出す。
- 要点ごとに短いアニメーション（CSS のみ）を付ける。画面に入ったときに再生し、「もう一度」で再生し直せる。`prefers-reduced-motion` では動かさない。文章だけで同じ内容が分かるようにし、アニメーションは補助に留める。
- 仕様（権限・数値・操作名）を変えたときは、マニュアルの該当箇所も同じ変更で直す。
