"use client";

import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, FlaskConical, Lightbulb, Maximize2, RefreshCw, Scissors, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type Dashboard } from "@/lib/api/client";
import { PRIORITY, VERDICT_LABEL, labelOf, scoreColor } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";
import Modal from "../../components/ui/Modal";
import { BarRow, CountUp, GrowBar, ScoreRing, TrendLine, toneForScore } from "./components/Charts";
import { useProject } from "./ProjectContext";

const COMPONENT_LABELS: { key: "alignment" | "validation" | "schedule" | "waste"; label: string }[] = [
  { key: "alignment", label: "目的整合" },
  { key: "validation", label: "検証の進み" },
  { key: "schedule", label: "期限" },
  { key: "waste", label: "ムダの少なさ" },
];

export default function DashboardPage() {
  const { project, items, mode, version, evaluate, evaluating, bump } = useProject();
  const { toast } = useToast();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<"weak" | "under" | "risk" | null>(null);
  const cl = mode.card_labels;
  const lb = mode.labels;

  const load = useCallback(async () => {
    setError(null);
    try {
      setDash(await api.dashboard(project.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const feedback = async (taskId: string, judgement: "agree" | "dismiss") => {
    setSending(taskId);
    try {
      await api.addFeedback(project.id, taskId, judgement);
      toast({
        tone: "success",
        message: judgement === "dismiss" ? "この指摘を除外しました。タスクの内容が変わると再び判定されます。" : "フィードバックを記録しました。",
      });
      bump();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setSending(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!dash) return <DashboardSkeleton />;

  if (items.tasks.length === 0) {
    return (
      <EmptyState
        title={`${lb.task}がまだ登録されていません`}
        description={`進行中の作業を${lb.task}として登録すると、${lb.goal}・${lb.assumption}・${lb.criterion}に沿っているかを AI が判定します。`}
        action={
          <Link href={`/projects/${project.id}/tasks`} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            {lb.task}を登録する
          </Link>
        }
      />
    );
  }

  const pending = dash.unevaluated_task_ids.length + dash.stale_task_ids.length;
  const delta = dash.health.delta_vs_last_month;
  const cards = [
    { label: cl.drift, hint: cl.drift_hint, value: dash.cards.drift, color: "text-rose-600", tint: "bg-rose-50 text-rose-600", ring: "hover:border-rose-200", Icon: AlertTriangle, href: "#alerts" },
    { label: cl.unnecessary, hint: cl.unnecessary_hint, value: dash.cards.unnecessary, color: "text-orange-600", tint: "bg-orange-50 text-orange-600", ring: "hover:border-orange-200", Icon: Scissors, href: "#alerts" },
    { label: cl.deadline_risk, hint: cl.deadline_risk_hint, value: dash.cards.deadline_risk, color: "text-amber-600", tint: "bg-amber-50 text-amber-600", ring: "hover:border-amber-200", Icon: Clock, href: "#deadline-risks" },
    { label: cl.untested, hint: cl.untested_hint, value: dash.cards.untested, color: "text-sky-600", tint: "bg-sky-50 text-sky-600", ring: "hover:border-sky-200", Icon: FlaskConical, href: "#under-evidenced" },
  ];

  const expandButton = (k: "weak" | "under" | "risk") => (
    <button
      type="button"
      onClick={() => setExpanded(k)}
      aria-label="拡大して表示"
      title="拡大して表示"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-primary focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
    >
      <Maximize2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  return (
    <div className="space-y-4">
      {(pending > 0 || dash.design_changed || !dash.last_evaluated_at) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" role="status">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {!dash.last_evaluated_at
              ? "まだ AI 評価を実行していません。"
              : dash.design_changed
                ? `${lb.goal}・${lb.assumption}・${lb.criterion}が前回の評価から変更されています。`
                : `前回の評価以降に追加・変更された${lb.task}が ${pending} 件あります（ダッシュボードの数値に未反映）。`}
            「AI で評価」を実行すると最新の状態に更新されます。
          </p>
          <Button size="sm" onClick={() => void evaluate()} disabled={evaluating}>
            <RefreshCw className={cn("h-4 w-4", evaluating && "animate-spin")} aria-hidden="true" />
            {evaluating ? "評価中..." : "今すぐ評価"}
          </Button>
        </div>
      )}

      <Card title={`${mode.name}健全度ダッシュボード`}>
        <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-3">
            <p className="text-sm font-semibold text-slate-700">Health Score</p>
            <ScoreRing score={dash.health.score} size={104} />
            <p className={cn("text-sm font-bold", delta == null ? "text-slate-500" : delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {delta == null ? "先月比 比較データなし" : `先月比 ${delta >= 0 ? "+" : ""}${delta}`}
            </p>
            <p className="text-xs text-slate-600">
              {dash.last_evaluated_at ? `評価 ${formatDateTime(dash.last_evaluated_at)}・毎朝 6 時に自動更新` : "未評価"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {cards.map((c, i) => (
              <a
                key={c.label}
                href={c.href}
                style={{ "--i": i } as React.CSSProperties}
                className={cn(
                  "stagger group relative flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                  c.ring,
                )}
              >
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110", c.value > 0 ? c.tint : "bg-slate-100 text-slate-400")}>
                  <c.Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-600">{c.label}</span>
                  <span className={cn("flex items-baseline gap-0.5 text-3xl font-extrabold leading-tight tabular-nums", c.value > 0 ? c.color : "text-slate-400")}>
                    <CountUp value={c.value} />
                    <span className="text-sm font-medium">件</span>
                  </span>
                  <span className="block truncate text-[11px] text-slate-500" title={c.hint}>
                    {c.hint}
                  </span>
                </span>
                <ArrowUpRight className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-300 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
              </a>
            ))}
            <div className="stagger col-span-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 xl:col-span-4" style={{ "--i": 4 } as React.CSSProperties}>
              <p className="mb-1 text-sm font-semibold text-slate-700">スコアの内訳（0〜100）</p>
              <div className="grid gap-x-6 sm:grid-cols-2">
                {COMPONENT_LABELS.map(({ key, label }, i) => {
                  const v = dash.health.components[key];
                  return (
                    <BarRow
                      key={key}
                      index={i}
                      tone={toneForScore(v)}
                      label={label}
                      value={v ?? 0}
                      valueLabel={v == null ? "対象なし" : String(Math.round(v))}
                      tooltip={v == null ? `${label}: 計算対象のデータがありません` : `${label}: ${Math.round(v)}`}
                    />
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                期間の経過 {Math.round(dash.schedule.elapsed * 100)}% ／ 進捗 {Math.round(dash.schedule.progress * 100)}%（{lb.criterion}の達成と{lb.task}の完了から算出）
                {dash.schedule.days_left >= 0 ? `・${lb.deadline}まで残り ${dash.schedule.days_left} 日` : `・${lb.deadline}を ${-dash.schedule.days_left} 日超過`}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:h-[calc(100vh-35rem)] lg:min-h-[16rem] lg:grid-cols-3">
      <Card className="stagger flash-target flex min-h-0 flex-col" title={`AI からの指摘（${dash.alerts.length} 件）`} id="alerts">
<div className="thin-scroll min-h-0 flex-1 overflow-y-auto pr-1.5">
        {dash.alerts.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            現在、{cl.drift}・{cl.unnecessary}に当たる{lb.task}はありません。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dash.alerts.map((a, i) => (
              <li key={a.task_id} className="stagger flex flex-col gap-2 py-3" style={{ "--i": i + 3 } as React.CSSProperties}>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={VERDICT_LABEL[a.verdict].variant}>
                      {a.verdict === "drift" ? cl.drift : a.verdict === "unnecessary_candidate" ? cl.unnecessary : VERDICT_LABEL[a.verdict].label}
                    </Badge>
                    <span className={cn("text-xs font-semibold tabular-nums", scoreColor(a.alignment_score))}>整合 {a.alignment_score}</span>
                    <span className="break-words font-semibold text-slate-900">{a.title}</span>
                  </div>
                  <p className="text-sm text-slate-700">{a.reason}</p>
                  {a.suggested_action && (
                    <p className="flex items-start gap-1.5 text-sm text-primary">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {a.suggested_action}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={sending === a.task_id} onClick={() => void feedback(a.task_id, "agree")} title="指摘のとおり。記録だけ残す">
                    <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                    指摘どおり
                  </Button>
                  <Button variant="outline" size="sm" disabled={sending === a.task_id} onClick={() => void feedback(a.task_id, "dismiss")} title="この指摘は当たらない。件数から除外する">
                    <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                    問題ない（除外）
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
</div>
      </Card>

        <div className="grid min-h-0 gap-4 lg:grid-rows-2">
        <Card className="stagger flex min-h-0 flex-col" title={cl.weak_tasks_title} actions={expandButton("weak")}>
<div className="thin-scroll min-h-0 flex-1 overflow-y-auto pr-1.5">
          {dash.weak_tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">評価済みの{lb.task}がありません。</p>
          ) : (
            <div>
              {dash.weak_tasks.map((w, i) => (
                <BarRow
                  key={w.task_id}
                  index={i}
                  tone="rose"
                  label={w.title}
                  value={w.gap}
                  valueLabel={`ズレ ${w.gap}`}
                />
              ))}
              <p className="mt-2 text-xs text-slate-600">バーが長いほど{lb.goal}との紐づきが弱い（100 − 整合スコア）</p>
            </div>
          )}
</div>
        </Card>
        <Card className="stagger flash-target flex min-h-0 flex-col" title={cl.under_evidenced_title} id="under-evidenced" actions={expandButton("under")}>
<div className="thin-scroll min-h-0 flex-1 overflow-y-auto pr-1.5">
          {dash.under_evidenced.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">検証中・未検証の{lb.assumption}はありません。</p>
          ) : (
            <div>
              {dash.under_evidenced.map((u, i) => (
                <BarRow
                  key={u.assumption_id}
                  index={i}
                  label={u.text}
                  value={u.shortage}
                  tone="slate"
                  valueLabel={`不足 ${u.shortage}`}
                />
              ))}
              <p className="mt-2 text-xs text-slate-600">優先度の高い順。{lb.evidence}を登録すると減ります。</p>
            </div>
          )}
</div>
        </Card>
        </div>

        <div className="grid min-h-0 gap-4 lg:grid-rows-2">
        <Card className="stagger flash-target flex min-h-0 flex-col" title={`${cl.deadline_risk}（${dash.deadline_risks.length} 件）`} id="deadline-risks" actions={expandButton("risk")}>
<div className="thin-scroll min-h-0 flex-1 overflow-y-auto pr-1.5">
          {dash.deadline_risks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">期限リスクはありません。</p>
          ) : (
            <ul className="space-y-2">
              {dash.deadline_risks.map((r, i) => (
                <li key={`${r.kind}-${r.item_id}`} className="stagger flex items-start gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-amber-50/70" style={{ "--i": i } as React.CSSProperties}>
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
                  <span>
                    <Badge variant="orange" className="mr-2">
                      {r.kind === "overdue_task" ? `期日超過の${lb.task}` : `未達成の${lb.criterion}`}
                    </Badge>
                    {r.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
</div>
        </Card>
        <Card className="stagger flex min-h-0 flex-col" title="健全度の推移">
<div className="thin-scroll min-h-0 flex-1 overflow-y-auto pr-1.5">
          <TrendLine points={dash.trend} />
</div>
        </Card>
        </div>
      </div>

      <Modal open={expanded === "weak"} title={cl.weak_tasks_title} onClose={() => setExpanded(null)}>
        {dash.weak_tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">評価済みの{lb.task}がありません。</p>
        ) : (
          <ol className="space-y-3">
            {dash.weak_tasks.map((w, i) => (
              <li key={w.task_id} className="stagger rounded-2xl border border-slate-200 p-4" style={{ "--i": i } as React.CSSProperties}>
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="break-words text-base font-bold text-slate-900">{w.title}</p>
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={VERDICT_LABEL[w.verdict].variant}>
                        {w.verdict === "drift" ? cl.drift : w.verdict === "unnecessary_candidate" ? cl.unnecessary : VERDICT_LABEL[w.verdict].label}
                      </Badge>
                      <span className={cn("font-semibold tabular-nums", scoreColor(w.alignment_score))}>整合 {w.alignment_score}</span>
                      <span className="font-semibold tabular-nums text-rose-600">ズレ {w.gap}</span>
                    </p>
                    <GrowBar value={w.gap} tone="rose" index={i} />
                    {w.reason && <p className="text-sm leading-relaxed text-slate-700">{w.reason}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-xs text-slate-600">バーが長いほど{lb.goal}との紐づきが弱い（100 − 整合スコア）</p>
      </Modal>

      <Modal open={expanded === "under"} title={cl.under_evidenced_title} onClose={() => setExpanded(null)}>
        {dash.under_evidenced.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">検証中・未検証の{lb.assumption}はありません。</p>
        ) : (
          <ol className="space-y-3">
            {dash.under_evidenced.map((u, i) => (
              <li key={u.assumption_id} className="stagger rounded-2xl border border-slate-200 p-4" style={{ "--i": i } as React.CSSProperties}>
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="break-words text-base font-bold text-slate-900">{u.text}</p>
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span>
                        優先度 <b className="text-slate-900">{labelOf(PRIORITY, u.priority)}</b>
                      </span>
                      <span>
                        {lb.evidence} <b className="tabular-nums text-slate-900">{u.evidence_count}</b> 件
                      </span>
                      <span>
                        不足 <b className="tabular-nums text-slate-900">{u.shortage}</b> / 100
                      </span>
                    </p>
                    <GrowBar value={u.shortage} tone="slate" index={i} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-xs text-slate-600">優先度の高い順。{lb.evidence}を登録すると減ります。</p>
      </Modal>

      <Modal open={expanded === "risk"} title={`${cl.deadline_risk}（${dash.deadline_risks.length} 件）`} onClose={() => setExpanded(null)}>
        {dash.deadline_risks.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">期限リスクはありません。</p>
        ) : (
          <ul className="space-y-3">
            {dash.deadline_risks.map((r, i) => (
              <li key={`${r.kind}-${r.item_id}`} className="stagger flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/50 p-4" style={{ "--i": i } as React.CSSProperties}>
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
                <div className="min-w-0 space-y-1.5">
                  <Badge variant="orange">{r.kind === "overdue_task" ? `期日超過の${lb.task}` : `未達成の${lb.criterion}`}</Badge>
                  <p className="break-words text-base font-semibold text-slate-900">{r.text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

/** Placeholder with the dashboard's silhouette while the first response is in flight. */
function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="ダッシュボードを読み込み中">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
          <div className="skeleton h-44 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20 rounded-2xl" />
            ))}
            <div className="skeleton col-span-2 h-20 rounded-2xl xl:col-span-4" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-56 rounded-2xl" />
        ))}
      </div>
      <span className="sr-only">読み込み中です</span>
    </div>
  );
}
