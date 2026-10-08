"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type Dashboard } from "@/lib/api/client";
import { VERDICT_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import Card from "../../../components/ui/Card";
import { ErrorState, LoadingState } from "../../../components/ui/States";
import { BarRow, TrendLine } from "../components/Charts";
import { Radar, StackedBar, type Segment } from "../components/AnalysisCharts";
import { useProject } from "../ProjectContext";

const COMPONENT_LABELS = [
  { key: "alignment", label: "目的整合" },
  { key: "validation", label: "検証の進み" },
  { key: "schedule", label: "期限" },
  { key: "waste", label: "ムダの少なさ" },
] as const;

/** Card that fills its grid cell; the body scrolls inside the card, never the page (SPEC §12.3). */
function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card title={title} className={cn("flex min-h-0 flex-col !p-4 [&>div:first-child]:!mb-2", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </Card>
  );
}

export default function AnalysisPage() {
  const { project, mode, version } = useProject();
  const lb = mode.labels;
  const cl = mode.card_labels;
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!dash) return <LoadingState />;

  const vc = dash.verdict_counts;
  const verdictSegments: Segment[] = [
    { key: "aligned", label: VERDICT_LABEL.aligned.label, value: vc.aligned, swatch: "bg-emerald-500" },
    { key: "weak", label: VERDICT_LABEL.weak.label, value: vc.weak, swatch: "bg-amber-400" },
    { key: "drift", label: cl.drift, value: vc.drift, swatch: "bg-rose-500" },
    { key: "unnecessary", label: cl.unnecessary, value: vc.unnecessary, swatch: "bg-orange-500" },
    { key: "dismissed", label: "除外済み", value: vc.dismissed, swatch: "bg-slate-400" },
    { key: "pending", label: "未評価・再評価待ち", value: vc.pending, swatch: "bg-slate-200" },
  ];
  const { elapsed, progress, delayed, days_left: daysLeft } = dash.schedule;

  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden">
      <div className="grid gap-3 lg:h-full lg:grid-cols-2 lg:grid-rows-2">
        <Panel title={`${lb.task}の判定内訳`}>
          <StackedBar segments={verdictSegments} emptyText={`${lb.task}がまだ登録されていません。`} />
          {!dash.last_evaluated_at && <p className="mt-2 text-xs text-slate-500">AI 評価を実行すると判定が反映されます。</p>}
        </Panel>

        <Panel title="健全度の構成（0〜100）">
          <div className="flex h-full min-h-[11rem] items-center justify-center">
            <Radar axes={COMPONENT_LABELS.map(({ key, label }) => ({ label, value: dash.health.components[key] }))} />
          </div>
        </Panel>

        <Panel title="期間と進捗">
          <BarRow label="期間の経過" value={elapsed * 100} valueLabel={`${Math.round(elapsed * 100)}%`} tone="slate" />
          <BarRow label="進捗" value={progress * 100} valueLabel={`${Math.round(progress * 100)}%`} />
          <p className={cn("mt-1 text-xs", delayed ? "font-bold text-rose-600" : "text-slate-500")}>
            {delayed ? "進捗が期間の経過に遅れています。" : "進捗は期間の経過に追いついています。"}
            {daysLeft >= 0 ? `${lb.deadline}まで残り ${daysLeft} 日` : `${lb.deadline}を ${-daysLeft} 日超過`}
          </p>
          <div className="mt-2">
            <p className="mb-1 text-xs font-semibold text-slate-600">健全度の推移</p>
            <TrendLine points={dash.trend} />
          </div>
        </Panel>

        <Panel title={`${lb.assumption}ごとの${lb.evidence}`}>
          {dash.evidence_tally.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">{lb.assumption}がまだ登録されていません。</p>
          ) : (
            <ul className="space-y-2">
              {dash.evidence_tally.map((e) => {
                const total = e.supports + e.refutes + e.inconclusive;
                return (
                  <li key={e.assumption_id} title={`${e.text}\n支持 ${e.supports} ／ 否定 ${e.refutes} ／ 判断できない ${e.inconclusive}`}>
                    <p className="truncate text-sm text-slate-700">{e.text}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        {total > 0 && (
                          <>
                            <div className="bg-emerald-500" style={{ width: `${(e.supports / total) * 100}%` }} />
                            <div className="bg-rose-500" style={{ width: `${(e.refutes / total) * 100}%` }} />
                            <div className="bg-slate-400" style={{ width: `${(e.inconclusive / total) * 100}%` }} />
                          </>
                        )}
                      </div>
                      <span className="w-40 text-right text-xs tabular-nums text-slate-600">
                        {total === 0 ? "データなし" : `支持 ${e.supports}・否定 ${e.refutes}・不明 ${e.inconclusive}`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
