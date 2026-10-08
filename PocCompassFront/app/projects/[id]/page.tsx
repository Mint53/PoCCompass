"use client";

import { AlertTriangle, CheckCircle2, Clock, Lightbulb, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type Dashboard } from "@/lib/api/client";
import { VERDICT_LABEL, scoreColor } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";
import { BarRow, ScoreRing, TrendLine } from "./components/Charts";
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
  if (!dash) return <LoadingState />;

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
    { label: cl.drift, hint: cl.drift_hint, value: dash.cards.drift, color: "text-rose-600", accent: "border-t-rose-500", href: "#alerts" },
    { label: cl.unnecessary, hint: cl.unnecessary_hint, value: dash.cards.unnecessary, color: "text-orange-600", accent: "border-t-orange-500", href: "#alerts" },
    { label: cl.deadline_risk, hint: cl.deadline_risk_hint, value: dash.cards.deadline_risk, color: "text-orange-600", accent: "border-t-orange-500", href: "#deadline-risks" },
    { label: cl.untested, hint: cl.untested_hint, value: dash.cards.untested, color: "text-sky-700", accent: "border-t-sky-500", href: "#under-evidenced" },
  ];

  return (
    <div className="space-y-6">
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
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700">Health Score</p>
            <ScoreRing score={dash.health.score} />
            <p className={cn("text-sm font-bold", delta == null ? "text-slate-500" : delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {delta == null ? "先月比 比較データなし" : `先月比 ${delta >= 0 ? "+" : ""}${delta}`}
            </p>
            <p className="text-xs text-slate-600">
              {dash.last_evaluated_at ? `評価 ${formatDateTime(dash.last_evaluated_at)}・毎朝 6 時に自動更新` : "未評価"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {cards.map((c) => (
              <a
                key={c.label}
                href={c.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border border-t-4 border-slate-200 p-4 text-center transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring",
                  c.value > 0 ? c.accent : "border-t-slate-200",
                )}
              >
                <p className="text-sm font-semibold text-slate-800">{c.label}</p>
                <p className={cn("text-4xl font-bold tabular-nums", c.value > 0 ? c.color : "text-slate-400")}>
                  {c.value}
                  <span className="ml-0.5 text-sm font-medium">件</span>
                </p>
                <p className="text-xs text-slate-600">{c.hint}</p>
              </a>
            ))}
            <div className="col-span-2 rounded-xl border border-slate-200 p-4 xl:col-span-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">スコアの内訳（0〜100）</p>
              <div className="grid gap-x-6 sm:grid-cols-2">
                {COMPONENT_LABELS.map(({ key, label }) => {
                  const v = dash.health.components[key];
                  return (
                    <BarRow
                      key={key}
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

      <Card title={`AI からの指摘（${dash.alerts.length} 件）`} id="alerts">
        {dash.alerts.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            現在、{cl.drift}・{cl.unnecessary}に当たる{lb.task}はありません。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dash.alerts.map((a) => (
              <li key={a.task_id} className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
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
                <div className="flex shrink-0 gap-2">
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
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={cl.weak_tasks_title}>
          {dash.weak_tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">評価済みの{lb.task}がありません。</p>
          ) : (
            <div>
              {dash.weak_tasks.map((w) => (
                <BarRow key={w.task_id} tone="rose" label={w.title} value={w.gap} valueLabel={`ズレ ${w.gap}`} tooltip={`${w.title}\n整合スコア ${w.alignment_score}\n${w.reason}`} />
              ))}
              <p className="mt-2 text-xs text-slate-600">バーが長いほど{lb.goal}との紐づきが弱い（100 − 整合スコア）</p>
            </div>
          )}
        </Card>
        <Card title={cl.under_evidenced_title} id="under-evidenced">
          {dash.under_evidenced.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">検証中・未検証の{lb.assumption}はありません。</p>
          ) : (
            <div>
              {dash.under_evidenced.map((u) => (
                <BarRow
                  key={u.assumption_id}
                  label={u.text}
                  value={u.shortage}
                  tone="slate"
                  valueLabel={`不足 ${u.shortage}`}
                  tooltip={`${u.text}\n${lb.evidence} ${u.evidence_count} 件`}
                />
              ))}
              <p className="mt-2 text-xs text-slate-600">優先度の高い順。{lb.evidence}を登録すると減ります。</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`${cl.deadline_risk}（${dash.deadline_risks.length} 件）`} id="deadline-risks">
          {dash.deadline_risks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">期限リスクはありません。</p>
          ) : (
            <ul className="space-y-2">
              {dash.deadline_risks.map((r) => (
                <li key={`${r.kind}-${r.item_id}`} className="flex items-start gap-2 text-sm">
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
        </Card>
        <Card title="健全度の推移">
          <TrendLine points={dash.trend} />
        </Card>
      </div>

      <p className="flex items-center gap-2 border-t border-dashed border-slate-200 pt-4 text-sm text-primary">
        <Lightbulb className="h-4 w-4" aria-hidden="true" />
        「進捗」ではなく「{lb.goal}に合っているか」を AI が見張ります。判断は人が行い、指摘が当たらない場合は「問題ない（除外）」を押してください。
      </p>
    </div>
  );
}
