"use client";

import { useState } from "react";
import type { Assumption, Criterion, Task, TaskFields } from "@/lib/api/client";
import { TASK_STATUS } from "@/lib/labels";
import Button from "../../../components/ui/Button";
import Field from "../../../components/ui/Field";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import Textarea from "../../../components/ui/Textarea";

export type TaskDraft = Required<Omit<TaskFields, "type">>;

export function emptyDraft(): TaskDraft {
  return { title: "", description: "", status: "todo", effort_hours: null, start_date: null, due_date: null, linked_assumption_ids: [], linked_criterion_ids: [] };
}

export function draftFromTask(t: Task): TaskDraft {
  return {
    title: t.title,
    description: t.description,
    status: t.status,
    effort_hours: t.effort_hours,
    start_date: t.start_date ?? null,
    due_date: t.due_date,
    linked_assumption_ids: t.linked_assumption_ids,
    linked_criterion_ids: t.linked_criterion_ids,
  };
}

function LinkPicker({
  legend,
  options,
  selected,
  onChange,
  disabled,
}: {
  legend: string;
  options: { id: string; text: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-slate-800">{legend}</legend>
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[rgb(var(--primary))]"
              checked={selected.includes(o.id)}
              onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))}
              disabled={disabled}
            />
            <span className="text-slate-700">{o.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function TaskForm({
  initial,
  labels,
  placeholder,
  assumptions,
  criteria,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: TaskDraft;
  labels: { task: string; assumption: string; criterion: string };
  placeholder: string;
  assumptions: Assumption[];
  criteria: Criterion[];
  submitLabel: string;
  onSubmit: (d: TaskDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<TaskDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TaskDraft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!d.title.trim()) {
      setError(`${labels.task}名を入力してください。`);
      return;
    }
    if (d.effort_hours != null && !(d.effort_hours > 0)) {
      setError("工数は 0 より大きい数値で入力してください。");
      return;
    }
    if (d.start_date && d.due_date && d.start_date > d.due_date) {
      setError("開始日は期日以前の日付にしてください。");
      return;
    }
    setError(null);
    setSaving(true);
    const ok = await onSubmit({ ...d, title: d.title.trim(), description: d.description.trim() });
    setSaving(false);
    if (!ok) return;
  };

  return (
    <div className="space-y-4">
      <Field label={`${labels.task}名`} htmlFor="task-title" required error={error}>
        <Input id="task-title" value={d.title} maxLength={100} placeholder={placeholder} onChange={(e) => set({ title: e.target.value })} disabled={saving} autoFocus />
      </Field>
      <Field label="内容・ねらい" htmlFor="task-desc" hint="何を作る／調べるのか、なぜやるのかを書くと AI の判定が正確になります。">
        <Textarea id="task-desc" value={d.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} disabled={saving} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="状態" htmlFor="task-status">
          <Select id="task-status" value={d.status} options={[...TASK_STATUS]} onChange={(e) => set({ status: e.target.value as TaskDraft["status"] })} disabled={saving} />
        </Field>
        <Field label="工数（時間・任意）" htmlFor="task-effort" hint="健全度の重み付けに使います">
          <Input
            id="task-effort"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={d.effort_hours ?? ""}
            onChange={(e) => set({ effort_hours: e.target.value === "" ? null : Number(e.target.value) })}
            disabled={saving}
          />
        </Field>
        <Field label="開始日（任意）" htmlFor="task-start" hint="WBS の帯の開始位置">
          <Input id="task-start" type="date" value={d.start_date ?? ""} max={d.due_date ?? undefined} onChange={(e) => set({ start_date: e.target.value || null })} disabled={saving} />
        </Field>
        <Field label="期日（任意）" htmlFor="task-due">
          <Input id="task-due" type="date" value={d.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value || null })} disabled={saving} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <LinkPicker
          legend={`関係する${labels.assumption}（任意）`}
          options={assumptions.map((a) => ({ id: a.id, text: a.text }))}
          selected={d.linked_assumption_ids}
          onChange={(ids) => set({ linked_assumption_ids: ids })}
          disabled={saving}
        />
        <LinkPicker
          legend={`関係する${labels.criterion}（任意）`}
          options={criteria.map((c) => ({ id: c.id, text: c.text }))}
          selected={d.linked_criterion_ids}
          onChange={(ids) => set({ linked_criterion_ids: ids })}
          disabled={saving}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          キャンセル
        </Button>
        <Button onClick={() => void submit()} disabled={saving}>
          {saving ? "保存中..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
