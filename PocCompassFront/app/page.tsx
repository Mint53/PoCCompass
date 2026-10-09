"use client";

import { CalendarClock, FlaskConical, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type Mode, type Project } from "@/lib/api/client";
import { PROJECT_STATUS, scoreColor } from "@/lib/labels";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import Badge from "./components/ui/Badge";
import Button from "./components/ui/Button";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import { EmptyState, ErrorState } from "./components/ui/States";
import { useToast } from "./components/ui/ToastProvider";
import { useApp } from "./contexts/AppContext";

const FILTER_KEY = "poc-compass.mode-filter";

export default function ProjectListPage() {
  const { modes, modeOf } = useApp();
  const [filter, setFilter] = useState<Mode | "all">("all");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FILTER_KEY);
      if (saved && (saved === "all" || modes.some((m) => m.id === saved))) setFilter(saved as Mode | "all");
    } catch {
      // storage unavailable: keep default
    }
  }, [modes]);

  const load = useCallback(async () => {
    setError(null);
    setProjects(null);
    try {
      setProjects(await api.listProjects(filter === "all" ? undefined : filter));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeFilter = (f: Mode | "all") => {
    setFilter(f);
    try {
      window.localStorage.setItem(FILTER_KEY, f);
    } catch {
      // ignore
    }
  };

  const createSamples = async () => {
    setSampleBusy(true);
    try {
      await api.createSamples();
      setSampleOpen(false);
      toast({ tone: "success", message: "サンプルの取り組みを 3 件作成しました。" });
      await load();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setSampleBusy(false);
    }
  };

  const newHref = `/projects/new${filter === "all" ? "" : `?mode=${filter}`}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">取り組み一覧</h1>
          <p className="mt-1 text-sm text-slate-600">
            目的・仮説・成功条件からのズレを AI が見張ります。モードを選んで絞り込めます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className="h-10" onClick={() => setSampleOpen(true)}>
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          サンプルを作成
        </Button>
        <Link
          href={newHref}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          新しい取り組み
        </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="モードで絞り込み">
        {[{ id: "all" as const, name: "すべて" }, ...modes].map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={filter === m.id}
            onClick={() => changeFilter(m.id)}
            className={cn(
              "h-10 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
              filter === m.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {m.name}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && projects === null && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="読み込み中">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      )}
      {projects && projects.length === 0 && (
        <EmptyState
          title="取り組みがまだありません"
          description="目的・仮説・成功条件を登録すると、タスクが目的に沿っているかを AI が判定します。"
          action={
            <Link href={newHref} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
              最初の取り組みを作成
            </Link>
          }
        />
      )}
      {projects && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const mode = modeOf(p.mode);
            const s = p.summary;
            const status = PROJECT_STATUS[p.status];
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 card-shadow transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="brand">{mode.name}</Badge>
                      {status && <Badge variant={status.variant}>{status.label}</Badge>}
                    </div>
                    <h2 className="break-words text-base font-bold text-slate-900 group-hover:text-primary">{p.title}</h2>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-3xl font-bold tabular-nums", scoreColor(s.health_score))}>
                      {s.health_score ?? "—"}
                    </p>
                    <p className="text-xs text-slate-600">健全度</p>
                  </div>
                </div>
                <p className="line-clamp-2 text-sm text-slate-600">{p.goal}</p>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    [mode.card_labels.drift, s.drift, "text-rose-600"],
                    [mode.card_labels.unnecessary, s.unnecessary, "text-orange-600"],
                    [mode.card_labels.deadline_risk, s.deadline_risk, "text-orange-600"],
                    [mode.card_labels.untested, s.untested, "text-sky-700"],
                  ].map(([label, n, color]) => (
                    <div key={label as string} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5">
                      <dt className="truncate text-slate-700" title={label as string}>
                        {label}
                      </dt>
                      <dd className={cn("font-bold tabular-nums", (n as number) > 0 ? (color as string) : "text-slate-400")}>
                        {n}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {mode.labels.deadline} {formatDate(p.deadline)}
                  </span>
                  <span>{s.evaluated_at ? `評価 ${formatDateTime(s.evaluated_at)}` : "未評価"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={sampleOpen}
        title="サンプルの取り組みを作成しますか？"
        description="PoC・企画・業務改善の 3 モード分、設計・タスク・検証データ・要望課題・業務整理まで記入済みの取り組みを作ります。作成後は設定画面から削除できます。"
        confirmLabel="作成する"
        busy={sampleBusy}
        onConfirm={createSamples}
        onClose={() => setSampleOpen(false)}
      />
    </div>
  );
}
