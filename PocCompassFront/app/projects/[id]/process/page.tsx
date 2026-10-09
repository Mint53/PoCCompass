"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api, errorMessage, type ProcessStep, type ProcessVariant } from "@/lib/api/client";
import { PROCESS_VARIANT } from "@/lib/labels";
import { danglingNos, sortSteps, suggestNo } from "@/lib/process";
import { cn } from "@/lib/utils";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Input from "../../../components/ui/Input";
import { EmptyState } from "../../../components/ui/States";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";
import ProcessFlow from "../components/ProcessFlow";

const splitNos = (v: string) => v.split(/[,、，\s]+/).map((x) => x.trim()).filter(Boolean);

function StepRow({ step, all }: { step: ProcessStep; all: ProcessStep[] }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [no, setNo] = useState(step.no);
  const [assignee, setAssignee] = useState(step.assignee);
  const [content, setContent] = useState(step.content);
  const [next, setNext] = useState(step.next_nos.join(", "));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dirty = no !== step.no || assignee !== step.assignee || content !== step.content || next !== step.next_nos.join(", ");
  const dangling = danglingNos(step, all);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateItem(project.id, step.id, { no: no.trim(), assignee: assignee.trim(), content: content.trim(), next_nos: splitNos(next) });
      await reloadItems();
      toast({ tone: "success", message: "業務を保存しました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteItem(project.id, step.id);
      setConfirm(false);
      await reloadItems();
      toast({ tone: "success", message: "業務を削除しました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };

  return (
    <li className="space-y-1 border-b border-slate-100 py-3 last:border-0">
      <div className="grid gap-2 sm:grid-cols-[5rem_9rem_minmax(0,1fr)_9rem_auto] sm:items-center">
        <Input aria-label="業務No" value={no} maxLength={20} onChange={(e) => setNo(e.target.value)} disabled={busy} />
        <Input aria-label="担当者" placeholder="担当者" value={assignee} maxLength={50} onChange={(e) => setAssignee(e.target.value)} disabled={busy} />
        <Input aria-label="業務内容" value={content} maxLength={1000} onChange={(e) => setContent(e.target.value)} disabled={busy} />
        <Input aria-label="次の業務No" placeholder="次の業務No" value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => void save()} disabled={!dirty || busy || !no.trim() || !content.trim()}>
            保存
          </Button>
          <Button variant="ghost" size="icon" aria-label={`業務${step.no}を削除`} title="削除" onClick={() => setConfirm(true)} disabled={busy}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {dangling.length > 0 && <p className="text-xs text-amber-700">次の業務No「{dangling.join("、")}」は存在しないため、フロー図には矢印が描かれません。</p>}
      <ConfirmDialog
        open={confirm}
        title="業務を削除しますか？"
        description={`業務${step.no}「${step.content}」を削除します。他の業務の「次の業務No」からも外れます。`}
        confirmLabel="削除する"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </li>
  );
}

function AddForm({ variant, steps }: { variant: ProcessVariant; steps: ProcessStep[] }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [no, setNo] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [content, setContent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const noValue = no ?? suggestNo(steps);

  const add = async () => {
    if (!noValue.trim() || !content.trim()) return;
    setBusy(true);
    try {
      await api.createItem(project.id, { type: "process_step", variant, no: noValue.trim(), assignee: assignee.trim(), content: content.trim(), next_nos: splitNos(next) });
      setNo(null);
      setContent("");
      setNext("");
      await reloadItems();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) void add();
  };

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[5rem_9rem_minmax(0,1fr)_9rem_auto] sm:items-center">
      <Input aria-label="新しい業務No" value={noValue} maxLength={20} onChange={(e) => setNo(e.target.value)} onKeyDown={onEnter} disabled={busy} />
      <Input aria-label="新しい業務の担当者" placeholder="担当者" value={assignee} maxLength={50} onChange={(e) => setAssignee(e.target.value)} onKeyDown={onEnter} disabled={busy} />
      <Input aria-label="新しい業務の内容" placeholder="業務内容（例: 見積書を作成して上長に提出）" value={content} maxLength={1000} onChange={(e) => setContent(e.target.value)} onKeyDown={onEnter} disabled={busy} />
      <Input aria-label="新しい業務の次の業務No" placeholder="次の業務No" value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={onEnter} disabled={busy} />
      <Button variant="outline" onClick={() => void add()} disabled={busy || !noValue.trim() || !content.trim()}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        追加
      </Button>
    </div>
  );
}

export default function ProcessPage() {
  const { items } = useProject();
  const [variant, setVariant] = useState<ProcessVariant>("asis");
  const steps = useMemo(() => sortSteps(items.process_steps.filter((s) => s.variant === variant)), [items.process_steps, variant]);
  const count = (v: ProcessVariant) => items.process_steps.filter((s) => s.variant === v).length;
  const current = PROCESS_VARIANT.find((v) => v.value === variant)!;

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="AsIs / ToBe の切り替え" className="inline-flex gap-1 rounded-2xl bg-slate-100 p-1 ring-1 ring-slate-200/70">
        {PROCESS_VARIANT.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={variant === v.value}
            onClick={() => setVariant(v.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition",
              variant === v.value ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
            )}
          >
            {v.label}
            <span className="rounded-full bg-slate-100 px-1.5 text-xs tabular-nums text-slate-600">{count(v.value)}</span>
          </button>
        ))}
      </div>

      <Card title={`${current.label}の業務`}>
        {steps.length === 0 ? (
          <p className="text-sm text-slate-500">まだ業務がありません。業務No・担当者・業務内容を入力して追加してください。「次の業務No」を空にすると、番号順に次の業務へつながります。</p>
        ) : (
          <>
            <div className="hidden gap-2 px-1 pb-1 text-xs font-semibold text-slate-500 sm:grid sm:grid-cols-[5rem_9rem_minmax(0,1fr)_9rem_auto]">
              <span>業務No</span>
              <span>担当者</span>
              <span>業務内容</span>
              <span>次の業務No</span>
              <span className="w-[8.5rem]" />
            </div>
            <ul>{steps.map((s) => <StepRow key={`${s.id}-${s.updated_at}`} step={s} all={steps} />)}</ul>
          </>
        )}
        <AddForm variant={variant} steps={steps} />
      </Card>

      <Card title={`${current.label}のフロー図`}>
        {steps.length === 0 ? (
          <EmptyState title="フロー図はまだありません" description="業務を 1 件以上登録すると、担当者ごとのレーンに並んだフロー図が表示されます。" />
        ) : (
          <>
            <ProcessFlow steps={steps} title={current.label} />
            <p className="mt-2 text-xs text-slate-500">担当者ごとの行（レーン）に、業務No順に左から右へ並べています。矢印は「次の業務No」、空の場合は番号順の次の業務です。点線は前の業務へ戻る流れです。</p>
          </>
        )}
      </Card>
    </div>
  );
}
