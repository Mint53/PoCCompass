"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, errorMessage, type Assumption, type Criterion } from "@/lib/api/client";
import { ASSUMPTION_STATUS, CRITERION_STATUS, PRIORITY } from "@/lib/labels";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Field from "../../../components/ui/Field";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";

function BasicsCard() {
  const { project, mode, reloadProject, bump } = useProject();
  const { toast } = useToast();
  const [title, setTitle] = useState(project.title);
  const [goal, setGoal] = useState(project.goal);
  const [start, setStart] = useState(project.start_date);
  const [deadline, setDeadline] = useState(project.deadline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lb = mode.labels;
  const dirty = title !== project.title || goal !== project.goal || start !== project.start_date || deadline !== project.deadline;

  const save = async () => {
    if (!title.trim() || !goal.trim()) return setError(`タイトルと${lb.goal}は必須です。`);
    if (!start || !deadline || deadline < start) return setError(`${lb.deadline}は開始日以降の日付にしてください。`);
    setError(null);
    setSaving(true);
    try {
      await api.updateProject(project.id, { title: title.trim(), goal: goal.trim(), start_date: start, deadline });
      await reloadProject();
      bump();
      toast({ tone: "success", message: "基本情報を保存しました。" });
    } catch (e) {
      toast({ tone: "error", title: "保存できませんでした", message: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="基本情報"
      actions={
        <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? "保存中..." : "保存"}
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
        <Field label="タイトル" htmlFor="d-title" required>
          <Input id="d-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
        </Field>
        <Field label={lb.goal} htmlFor="d-goal" required hint={`変更すると、全ての${lb.task}が次回の評価で再判定されます。`}>
          <Textarea id="d-goal" value={goal} maxLength={2000} onChange={(e) => setGoal(e.target.value)} disabled={saving} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="開始日" htmlFor="d-start" required>
            <Input id="d-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={saving} />
          </Field>
          <Field label={lb.deadline} htmlFor="d-deadline" required>
            <Input id="d-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={saving} />
          </Field>
        </div>
      </div>
    </Card>
  );
}

type RowItem = Assumption | Criterion;

function ItemRow({ item, kind }: { item: RowItem; kind: "assumption" | "criterion" }) {
  const { project, mode, reloadItems } = useProject();
  const { toast } = useToast();
  const [text, setText] = useState(item.text);
  const [extra, setExtra] = useState(kind === "assumption" ? (item as Assumption).priority : (item as Criterion).target);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const original = kind === "assumption" ? (item as Assumption).priority : (item as Criterion).target;
  const dirty = text !== item.text || extra !== original;
  const label = kind === "assumption" ? mode.labels.assumption : mode.labels.criterion;

  const patch = async (body: Record<string, unknown>, message?: string) => {
    setBusy(true);
    try {
      await api.updateItem(project.id, item.id, body);
      await reloadItems();
      if (message) toast({ tone: "success", message });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteItem(project.id, item.id);
      setConfirm(false);
      await reloadItems();
      toast({ tone: "success", message: `${label}を削除しました。` });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-0 lg:flex-row lg:items-center">
      <Input aria-label={`${label}の本文`} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} disabled={busy} />
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
        {kind === "assumption" ? (
          <>
            <Select aria-label="優先度" className="w-28" value={extra} options={PRIORITY.map((p) => ({ value: p.value, label: `優先度 ${p.label}` }))} onChange={(e) => setExtra(e.target.value as Assumption["priority"])} disabled={busy} />
            <Select aria-label="検証状態" className="w-32" value={item.status} options={[...ASSUMPTION_STATUS]} onChange={(e) => void patch({ status: e.target.value }, "状態を更新しました。")} disabled={busy} />
          </>
        ) : (
          <>
            <Input aria-label="目標値" className="w-32" placeholder="目標値" value={extra} maxLength={200} onChange={(e) => setExtra(e.target.value)} disabled={busy} />
            <Select aria-label="達成状態" className="w-28" value={item.status} options={[...CRITERION_STATUS]} onChange={(e) => void patch({ status: e.target.value }, "状態を更新しました。")} disabled={busy} />
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || busy || !text.trim()}
          onClick={() => void patch(kind === "assumption" ? { text: text.trim(), priority: extra } : { text: text.trim(), target: extra.trim() }, `${label}を保存しました。`)}
        >
          保存
        </Button>
        <Button variant="ghost" size="icon" aria-label={`${label}を削除`} title="削除" onClick={() => setConfirm(true)} disabled={busy}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title={`${label}を削除しますか？`}
        description={
          kind === "assumption"
            ? `「${item.text}」を削除します。この${label}に登録された${mode.labels.evidence}も削除され、${mode.labels.task}のひも付けも外れます。`
            : `「${item.text}」を削除します。${mode.labels.task}のひも付けも外れます。`
        }
        confirmLabel="削除する"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </li>
  );
}

function AddRow({ kind }: { kind: "assumption" | "criterion" }) {
  const { project, mode, reloadItems } = useProject();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "assumption" ? mode.labels.assumption : mode.labels.criterion;
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.createItem(project.id, kind === "assumption" ? { type: "assumption", text: text.trim(), status: "untested", priority: "medium" } : { type: "criterion", text: text.trim(), target: "", status: "not_met" });
      setText("");
      await reloadItems();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 flex gap-2">
      <Input
        aria-label={`新しい${label}`}
        placeholder={kind === "assumption" ? mode.placeholders.assumption : mode.placeholders.criterion}
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) void add();
        }}
        disabled={busy}
      />
      <Button variant="outline" onClick={() => void add()} disabled={busy || !text.trim()}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        追加
      </Button>
    </div>
  );
}

export default function DesignPage() {
  const { items, mode } = useProject();
  return (
    <div className="space-y-6">
      <BasicsCard />
      <Card title={mode.labels.assumption}>
        {items.assumptions.length === 0 ? (
          <p className="text-sm text-slate-500">{mode.labels.assumption}がありません。AI の判定精度のため 1 つ以上登録してください。</p>
        ) : (
          <ul>{items.assumptions.map((a) => <ItemRow key={`${a.id}-${a.updated_at}`} item={a} kind="assumption" />)}</ul>
        )}
        <AddRow kind="assumption" />
      </Card>
      <Card title={mode.labels.criterion}>
        {items.criteria.length === 0 ? (
          <p className="text-sm text-slate-500">{mode.labels.criterion}がありません。AI の判定精度のため 1 つ以上登録してください。</p>
        ) : (
          <ul>{items.criteria.map((c) => <ItemRow key={`${c.id}-${c.updated_at}`} item={c} kind="criterion" />)}</ul>
        )}
        <AddRow kind="criterion" />
      </Card>
    </div>
  );
}
