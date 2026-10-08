"use client";

import Link from "next/link";
import { useMemo } from "react";
import { todayIso } from "@/lib/utils";
import { EmptyState } from "../../../components/ui/States";
import { TASK_STATUS, labelOf } from "@/lib/labels";
import Gantt, { STATUS_BAR, isOverdue, type GanttGroup } from "../components/Gantt";
import { useProject } from "../ProjectContext";

export default function WbsPage() {
  const { project, items, mode } = useProject();
  const lb = mode.labels;
  const today = todayIso();

  const groups = useMemo<GanttGroup[]>(() => {
    const byAssumption = new Map(items.assumptions.map((a) => [a.id, a.text]));
    const buckets = new Map<string, GanttGroup>();
    const none: GanttGroup = { key: "none", title: "ひも付けなし", tasks: [] };
    for (const t of items.tasks) {
      const first = t.linked_assumption_ids.find((id) => byAssumption.has(id));
      if (!first) {
        none.tasks.push(t);
        continue;
      }
      if (!buckets.has(first)) buckets.set(first, { key: first, title: `${lb.assumption}: ${byAssumption.get(first)}`, tasks: [] });
      buckets.get(first)!.tasks.push(t);
    }
    // keep assumptions in registration order, then the unlinked group
    const ordered = items.assumptions.map((a) => buckets.get(a.id)).filter((g): g is GanttGroup => !!g);
    const byStart = (a: { start_date?: string | null; due_date?: string | null }) => a.start_date ?? a.due_date ?? "9999-12-31";
    return [...ordered, ...(none.tasks.length ? [none] : [])].map((g) => ({ ...g, tasks: [...g.tasks].sort((a, b) => byStart(a).localeCompare(byStart(b))) }));
  }, [items.assumptions, items.tasks, lb.assumption]);

  if (items.tasks.length === 0) {
    return (
      <EmptyState
        title={`${lb.task}がまだ登録されていません`}
        description={`${lb.task}に開始日と期日を入れると、ここに WBS（ガントチャート）が表示されます。`}
        action={
          <Link href={`/projects/${project.id}/tasks`} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            {lb.task}を登録する
          </Link>
        }
      />
    );
  }

  const overdue = items.tasks.filter((t) => isOverdue(t, today)).length;
  const undated = items.tasks.filter((t) => !t.start_date && !t.due_date).length;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>帯は開始日〜期日（開始日なしは期日の 1 日のみ）</span>
        {(["todo", "doing", "done"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-4 rounded-sm ${STATUS_BAR[s]}`} aria-hidden="true" />
            {labelOf(TASK_STATUS, s)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-slate-300 ring-2 ring-rose-600" aria-hidden="true" />
          遅延
        </span>
        {overdue > 0 && <span className="font-bold text-rose-700">遅延 {overdue} 件</span>}
        {undated > 0 && <span>日程未設定 {undated} 件</span>}
      </div>
      <div className="min-h-0 flex-1">
        <Gantt groups={groups} rangeStart={project.start_date} rangeEnd={project.deadline} today={today} />
      </div>
    </div>
  );
}
