"use client";

import { FileText, Gavel, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type Report } from "@/lib/api/client";
import { cn, formatDateTime } from "@/lib/utils";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Field from "../../../components/ui/Field";
import Select from "../../../components/ui/Select";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui/States";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";

type DecisionKey = "continue" | "pivot" | "stop";

function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-slate-400">なし</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export default function ReportPage() {
  const { project, items, mode, reloadItems, reloadProject, canEdit } = useProject();
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [decision, setDecision] = useState<DecisionKey>("continue");
  const [note, setNote] = useState("");
  const [recording, setRecording] = useState(false);
  const lb = mode.labels;
  const decisionLabel: Record<DecisionKey, string> = {
    continue: lb.decision_continue,
    pivot: lb.decision_pivot,
    stop: lb.decision_stop,
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const rs = await api.listReports(project.id);
      setReports(rs);
      setSelected((cur) => cur ?? rs[0]?.id ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await api.createReport(project.id);
      setReports((prev) => [r, ...(prev ?? [])]);
      setSelected(r.id);
      toast({ tone: "success", message: "判断レポートを作成しました。" });
    } catch (e) {
      toast({ tone: "error", title: "レポートを作成できませんでした", message: errorMessage(e) });
    } finally {
      setGenerating(false);
    }
  };

  const record = async () => {
    setRecording(true);
    try {
      await api.createItem(project.id, { type: "decision", decision, note: note.trim() });
      setNote("");
      await Promise.all([reloadItems(), reloadProject()]);
      toast({ tone: "success", message: `判断「${decisionLabel[decision]}」を記録しました。` });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setRecording(false);
    }
  };

  const report = reports?.find((r) => r.id === selected) ?? null;
  const scroll = "thin-scroll min-h-0 flex-1 overflow-y-auto pr-1.5";

  return (
    <div className="thin-scroll flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="max-w-4xl text-sm text-slate-600">
          AI が現状を整理し、{lb.decision_continue}・{lb.decision_pivot}・{lb.decision_stop}それぞれの根拠と懸念を並べます。
          <strong className="font-semibold text-slate-800">判断は人が行います</strong>。最新の状態で作るには、先に「AI で評価」を実行してください。
        </p>
        {canEdit && (
          <Button onClick={() => void generate()} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {generating ? "作成中（数十秒かかります）" : "判断レポートを作成"}
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:min-h-[18rem] lg:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[minmax(0,1fr)]">
        {error && <ErrorState message={error} onRetry={load} />}
        {!error && reports === null && <LoadingState />}
        {reports && reports.length === 0 && !generating && (
          <EmptyState title="判断レポートはまだありません" description={canEdit ? "会議の前に作成すると、判断に必要な事実と論点が一覧になります。" : "編集者がレポートを作成すると、ここに表示されます。"} />
        )}
        {reports && reports.length === 0 && generating && <LoadingState />}

        {reports && reports.length > 0 && report && (
          <Card
            className="flex min-h-0 flex-col"
            title={
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4" aria-hidden="true" />
                判断レポート
              </span>
            }
            actions={
              reports.length > 1 ? (
                <>
                  <label htmlFor="report-select" className="sr-only">表示するレポート</label>
                  <Select
                    id="report-select"
                    className="w-auto"
                    value={report.id}
                    options={reports.map((r) => ({ value: r.id, label: `${formatDateTime(r.created_at)}（健全度 ${r.health_score ?? "—"}）` }))}
                    onChange={(e) => setSelected(e.target.value)}
                  />
                </>
              ) : (
                <span className="text-xs text-slate-500">{formatDateTime(report.created_at)} 作成・健全度 {report.health_score ?? "—"}</span>
              )
            }
          >
            <div className={cn(scroll, "space-y-4")}>
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h3 className="mb-1.5 text-sm font-bold text-slate-800">要約</h3>
                  <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{report.content.summary}</p>
                </div>
                <div>
                  <h3 className="mb-1.5 text-sm font-bold text-slate-800">判断に効く事実</h3>
                  <List items={report.content.highlights} />
                </div>
              </div>
              <div className="grid gap-3 xl:grid-cols-3">
                {report.content.options.map((o) => (
                  <div
                    key={o.decision}
                    className={cn(
                      "space-y-3 rounded-xl border p-4",
                      o.decision === "continue" && "border-emerald-200 bg-emerald-50/40",
                      o.decision === "pivot" && "border-amber-200 bg-amber-50/40",
                      o.decision === "stop" && "border-rose-200 bg-rose-50/40",
                    )}
                  >
                    <h3 className="text-base font-bold text-slate-900">{decisionLabel[o.decision]}</h3>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-600">支える事実</p>
                      <List items={o.supporting} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-600">懸念</p>
                      <List items={o.concerns} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-600">この判断をとる条件</p>
                      <List items={o.conditions} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-1.5 text-sm font-bold text-slate-800">会議で確認すべき問い</h3>
                  <List items={report.content.questions} />
                </div>
                <div>
                  <h3 className="mb-1.5 text-sm font-bold text-slate-800">どの判断でも有効な次の行動</h3>
                  <List items={report.content.next_actions} />
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card
          className="flex min-h-0 flex-col"
          title={
            <span className="inline-flex items-center gap-2">
              <Gavel className="h-4 w-4" aria-hidden="true" />
              判断の記録
            </span>
          }
        >
          {canEdit ? (
          <div className="shrink-0 space-y-3">
            <Field label="判断" htmlFor="decision">
              <Select id="decision" value={decision} options={(["continue", "pivot", "stop"] as const).map((d) => ({ value: d, label: decisionLabel[d] }))} onChange={(e) => setDecision(e.target.value as DecisionKey)} disabled={recording} />
            </Field>
            <Field label="理由・メモ" htmlFor="decision-note">
              <Textarea id="decision-note" rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} disabled={recording} />
            </Field>
            {decision === "stop" && (
              <p className="text-xs text-slate-600">「{lb.decision_stop}」を記録すると取り組みは「停止」になり、毎朝の自動評価の対象外になります。</p>
            )}
            <Button onClick={() => void record()} disabled={recording} className="w-full">
              {recording ? "記録中..." : "記録する"}
            </Button>
          </div>
          ) : (
            <p className="shrink-0 text-xs text-slate-500">閲覧のみのため、判断は記録できません。これまでの判断は下に表示されます。</p>
          )}
          {items.decisions.length > 0 && (
            <div className={cn(scroll, "mt-4 border-t border-slate-100")}>
              <ul className="divide-y divide-slate-100">
                {[...items.decisions].reverse().map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start gap-2 py-3 text-sm">
                    <Badge variant={d.decision === "continue" ? "green" : d.decision === "pivot" ? "yellow" : "red"}>{decisionLabel[d.decision]}</Badge>
                    <span className="text-xs text-slate-500">{formatDateTime(d.created_at)}・{d.created_by}</span>
                    {d.note && <p className="w-full whitespace-pre-line break-words text-slate-700">{d.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
