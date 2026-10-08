"use client";

import type { Task } from "@/lib/api/client";
import { TASK_STATUS, labelOf } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";

export type GanttGroup = { key: string; title: string; tasks: Task[] };

const DAY_MS = 86_400_000;
const LABEL_W = "15rem";
const STATUS_BAR: Record<Task["status"], string> = {
  todo: "bg-slate-400",
  doing: "bg-primary",
  done: "bg-emerald-500",
};

const toDay = (iso: string) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
const fromDay = (d: number) => new Date(d * DAY_MS);

/** Overdue = SPEC §5.1: due date passed and not done. */
export function isOverdue(t: Task, today: string): boolean {
  return !!t.due_date && t.status !== "done" && t.due_date < today;
}

function tickStep(totalDays: number): number {
  const steps = [1, 2, 7, 14, 30, 60, 90];
  return steps.find((s) => totalDays / s <= 12) ?? 180;
}

/** Gantt chart (SPEC §12.2). Header and group rows stay visible; only the rows area scrolls. */
export default function Gantt({ groups, rangeStart, rangeEnd, today }: { groups: GanttGroup[]; rangeStart: string; rangeEnd: string; today: string }) {
  const dated = groups.flatMap((g) => g.tasks).flatMap((t) => [t.start_date, t.due_date].filter((v): v is string => !!v));
  const min = Math.min(toDay(rangeStart), toDay(today), ...dated.map(toDay));
  const max = Math.max(toDay(rangeEnd), toDay(today), ...dated.map(toDay));
  const total = max - min + 1;
  const pct = (d: number) => ((d - min) / total) * 100;
  const step = tickStep(total);
  const ticks: number[] = [];
  for (let d = min; d <= max; d += step) ticks.push(d);
  const todayPct = pct(toDay(today) + 0.5);
  const cols = `${LABEL_W} minmax(0,1fr)`;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white text-sm">
      <div className="grid shrink-0 border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: cols }}>
        <div className="px-3 py-2 text-xs font-semibold text-slate-600">作業</div>
        <div className="relative h-8">
          {ticks.map((d) => (
            <span key={d} className="absolute top-2 -translate-x-1/2 whitespace-nowrap text-xs tabular-nums text-slate-500" style={{ left: `${pct(d)}%` }}>
              {fromDay(d).getUTCMonth() + 1}/{fromDay(d).getUTCDate()}
            </span>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-accent px-3 py-1 text-xs font-bold text-accent-foreground" title={g.title}>
              <span className="block truncate">{g.title}</span>
            </div>
            {g.tasks.map((t) => {
              const overdue = isOverdue(t, today);
              const start = t.start_date ?? t.due_date;
              const end = t.due_date ?? t.start_date;
              const statusLabel = labelOf(TASK_STATUS, t.status);
              const range = start && end ? `${formatDate(start)} 〜 ${formatDate(end)}` : "日程未設定";
              return (
                <div key={t.id} className="grid items-center border-b border-slate-100" style={{ gridTemplateColumns: cols }} title={`${t.title}\n${statusLabel}・${range}${overdue ? "・遅延" : ""}`}>
                  <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                    <span className="truncate text-slate-800">{t.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-500">{statusLabel}</span>
                    {overdue && <span className="shrink-0 rounded bg-rose-50 px-1 text-xs font-bold text-rose-700">遅延</span>}
                  </div>
                  <div className="relative h-8">
                    {ticks.map((d) => (
                      <span key={d} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${pct(d)}%` }} aria-hidden="true" />
                    ))}
                    {start && end ? (
                      <span
                        className={cn("absolute top-1.5 h-5 min-w-[6px] rounded", STATUS_BAR[t.status], overdue && "ring-2 ring-rose-600 ring-offset-1")}
                        style={{ left: `${pct(toDay(start))}%`, width: `${((toDay(end) - toDay(start) + 1) / total) * 100}%` }}
                      />
                    ) : (
                      <span className="absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">日程未設定</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {/* today line spans the rows area; positioned inside the timeline column */}
        <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_W }} aria-hidden="true">
          <span className="absolute inset-y-0 border-l-2 border-dashed border-rose-500" style={{ left: `${todayPct}%` }} />
        </div>
      </div>
    </div>
  );
}
