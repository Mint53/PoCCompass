"use client";

import { ArrowRight, Copy, CornerDownLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, type ProcessStep, type ProcessVariant } from "@/lib/api/client";
import { PROCESS_VARIANT } from "@/lib/labels";
import { assigneesOf, buildEdges, danglingNos, laneTone, NO_ASSIGNEE, sortSteps, suggestNo } from "@/lib/process";
import { cn } from "@/lib/utils";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Field from "../../../components/ui/Field";
import Combobox from "@/app/components/ui/Combobox";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Segmented from "../../../components/ui/Segmented";
import { EmptyState } from "../../../components/ui/States";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import ProcessFlow, { type FlowEdit } from "../components/ProcessFlow";
import { useProject } from "../ProjectContext";

type View = ProcessVariant | "compare";
type Draft = { no: string; assignee: string; content: string; next: string };

const splitNos = (v: string) => v.split(/[,、，\s]+/).map((x) => x.trim()).filter(Boolean);
const variantLabel = (v: ProcessVariant) => PROCESS_VARIANT.find((x) => x.value === v)!.label;
const SHORT: Record<ProcessVariant, string> = { asis: "AsIs", tobe: "ToBe" };

/** Count of arrows that go back to an earlier step (手戻り) — a plain tally of the drawn flow, not a score. */
const loopCount = (steps: ProcessStep[]) => {
  const sorted = sortSteps(steps);
  const idx = new Map(sorted.map((s, i) => [s.id, i]));
  return buildEdges(sorted).filter((e) => idx.get(e.to)! <= idx.get(e.from)!).length;
};

function AssigneeChip({ name, lanes }: { name: string; lanes: string[] }) {
  const tone = laneTone(Math.max(lanes.indexOf(name || NO_ASSIGNEE), 0));
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", name ? tone.chip : "bg-slate-50 text-slate-500 ring-slate-200")}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", name ? tone.dot : "bg-slate-300")} aria-hidden="true" />
      <span className="truncate">{name || NO_ASSIGNEE}</span>
    </span>
  );
}

function StepModal({ step, variant, steps, assignees, initialAssignee = "", onClose }: { step: ProcessStep | null; variant: ProcessVariant; steps: ProcessStep[]; assignees: string[]; initialAssignee?: string; onClose: () => void }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [d, setD] = useState<Draft>({ no: step?.no ?? suggestNo(steps), assignee: step?.assignee ?? initialAssignee, content: step?.content ?? "", next: step?.next_nos.join(", ") ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { no: d.no.trim(), assignee: d.assignee.trim(), content: d.content.trim(), next_nos: splitNos(d.next) };
      if (step) await api.updateItem(project.id, step.id, body);
      else await api.createItem(project.id, { type: "process_step", variant, ...body });
      await reloadItems();
      toast({ tone: "success", message: step ? "業務を保存しました。" : "業務を追加しました。" });
      onClose();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <Modal open title={step ? `業務${step.no}を編集` : `${SHORT[variant]} の業務を追加`} onClose={onClose} className="max-w-xl">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <Field label="業務No" htmlFor="ps-no" required>
            <Input id="ps-no" value={d.no} maxLength={20} onChange={(e) => setD({ ...d, no: e.target.value })} disabled={busy} />
          </Field>
          <Field label="担当者" htmlFor="ps-assignee" hint="既に使われている担当者は候補から選べます。">
            <Combobox id="ps-assignee" options={assignees} value={d.assignee} maxLength={50} placeholder="例: 営業" onChange={(v) => setD({ ...d, assignee: v })} disabled={busy} />
          </Field>
        </div>
        <Field label="業務内容" htmlFor="ps-content" required>
          <Textarea id="ps-content" value={d.content} maxLength={1000} placeholder="例: 見積書を作成して上長に提出する" onChange={(e) => setD({ ...d, content: e.target.value })} disabled={busy} />
        </Field>
        <Field label="次の業務No" htmlFor="ps-next" hint="分岐するときは「4, 5」のように並べます。空のときは番号順の次の業務につながります。">
          <Input id="ps-next" value={d.next} placeholder="例: 4, 5" onChange={(e) => setD({ ...d, next: e.target.value })} disabled={busy} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>キャンセル</Button>
          <Button onClick={() => void save()} disabled={busy || !d.no.trim() || !d.content.trim()}>{step ? "保存" : "追加"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function StepRow({ step, all, lanes, selected, canEdit, onSelect, onEdit, onDelete }: { step: ProcessStep; all: ProcessStep[]; lanes: string[]; selected: boolean; canEdit: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void }) {
  const dangling = danglingNos(step, all);
  return (
    <li
      id={`step-${step.id}`}
      onClick={onSelect}
      className={cn("group flex cursor-pointer flex-col gap-2 rounded-xl px-3 py-2.5 transition sm:flex-row sm:items-center sm:gap-3", selected ? "bg-accent/70 ring-1 ring-primary/30" : "hover:bg-slate-50")}
    >
      <span className={cn("w-fit shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums text-white sm:w-12 sm:text-center", laneTone(Math.max(lanes.indexOf(step.assignee || NO_ASSIGNEE), 0)).dot)}>{step.no}</span>
      <div className="shrink-0 sm:w-36"><AssigneeChip name={step.assignee} lanes={lanes} /></div>
      <p className="min-w-0 flex-1 break-words text-sm text-slate-800">{step.content}</p>
      <div className="flex shrink-0 flex-wrap items-center gap-1 sm:w-32">
        {step.next_nos.length > 0 ? (
          <>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {step.next_nos.map((n) => (
              <span key={n} className={cn("rounded-md px-1.5 text-xs font-semibold tabular-nums ring-1", dangling.includes(n) ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200")} title={dangling.includes(n) ? "この業務Noは存在しません" : undefined}>{n}</span>
            ))}
          </>
        ) : (
          <span className="text-xs text-slate-400">番号順</span>
        )}
      </div>
      {canEdit && <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`業務${step.no}を編集`} title="編集" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`業務${step.no}を削除`} title="削除" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>}
    </li>
  );
}

function QuickAdd({ variant, steps, assignees }: { variant: ProcessVariant; steps: ProcessStep[]; assignees: string[] }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [no, setNo] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const contentRef = useRef<HTMLInputElement>(null);
  const noValue = no ?? suggestNo(steps);
  const add = async () => {
    if (!noValue.trim() || !content.trim()) return;
    setBusy(true);
    try {
      await api.createItem(project.id, { type: "process_step", variant, no: noValue.trim(), assignee: assignee.trim(), content: content.trim(), next_nos: [] });
      setNo(null);
      setContent("");
      await reloadItems();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => contentRef.current?.focus());
    }
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) void add();
  };
  return (
    <div className="mt-2 flex shrink-0 flex-col gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-2.5 sm:flex-row sm:items-center">
      <Input aria-label="新しい業務No" className="sm:w-16" value={noValue} maxLength={20} onChange={(e) => setNo(e.target.value)} onKeyDown={onEnter} disabled={busy} />
      <div className="sm:w-40"><Combobox aria-label="新しい業務の担当者" placeholder="担当者" options={assignees} value={assignee} maxLength={50} onChange={setAssignee} onKeyDown={onEnter} disabled={busy} /></div>
      <Input ref={contentRef} aria-label="新しい業務の内容" className="min-w-0 sm:flex-1" placeholder="業務内容を入力して Enter（例: 見積書を作成して上長に提出）" value={content} maxLength={1000} onChange={(e) => setContent(e.target.value)} onKeyDown={onEnter} disabled={busy} />
      <Button onClick={() => void add()} disabled={busy || !noValue.trim() || !content.trim()}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        追加
      </Button>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5"><span className="rounded-md bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">開始</span>始まりの業務</span>
      <span className="inline-flex items-center gap-1.5"><span className="rounded-md bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">終了</span>終わりの業務</span>
      <span className="inline-flex items-center gap-1.5"><svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" className="stroke-slate-400" strokeWidth="1.5" strokeDasharray="5 4" /></svg><CornerDownLeft className="h-3 w-3" aria-hidden="true" />前の業務へ戻る</span>
    </div>
  );
}

function Delta({ label, a, b }: { label: string; a: number; b: number }) {
  const diff = b - a;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2 card-shadow">
      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-500">{label}</p>
      <p className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-sm font-bold text-slate-500">{a}</span>
        <ArrowRight className="h-3.5 w-3.5 self-center text-slate-400" aria-hidden="true" />
        <span className="text-lg font-extrabold text-slate-900">{b}</span>
      </p>
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", diff === 0 ? "bg-slate-100 text-slate-500" : diff < 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
        {diff === 0 ? "変化なし" : `${diff > 0 ? "+" : ""}${diff}`}
      </span>
    </div>
  );
}

export default function ProcessPage() {
  const { project, items, reloadItems, canEdit } = useProject();
  const { toast } = useToast();
  const [view, setView] = useState<View>("asis");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ step: ProcessStep | null; assignee?: string } | null>(null);
  const [deleting, setDeleting] = useState<ProcessStep | null>(null);
  const [busy, setBusy] = useState(false);

  const by = useMemo(() => ({
    asis: sortSteps(items.process_steps.filter((s) => s.variant === "asis")),
    tobe: sortSteps(items.process_steps.filter((s) => s.variant === "tobe")),
  }), [items.process_steps]);
  const allAssignees = useMemo(() => [...new Set(items.process_steps.map((s) => s.assignee).filter(Boolean))], [items.process_steps]);

  useEffect(() => setSelectedId(null), [view]);
  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) document.getElementById(`step-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteItem(project.id, deleting.id);
      setDeleting(null);
      setSelectedId(null);
      await reloadItems();
      toast({ tone: "success", message: "業務を削除しました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  /** GUI edits from the diagram (editors only). Each one is a plain PATCH of the step; the server keeps 次の業務No in sync with a renamed No. */
  const patchStep = async (step: ProcessStep, body: Parameters<typeof api.updateItem>[2], done: string) => {
    setBusy(true);
    try {
      await api.updateItem(project.id, step.id, body);
      await reloadItems();
      toast({ tone: "success", message: done });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  const flowEdit: FlowEdit | undefined = canEdit
    ? {
        busy,
        onMove: (step, change) => void patchStep(step, change, change.no ? `業務${step.no}を移動しました${change.no !== step.no ? `（業務No ${change.no}）` : ""}。` : `業務${step.no}の担当者を変えました。`),
        onLink: (step, nextNos) => void patchStep(step, { next_nos: nextNos }, `業務${step.no}の矢印を更新しました。`),
        onEditStep: (step) => setModal({ step }),
        onDeleteStep: (step) => setDeleting(step),
        onAddStep: (assignee) => setModal({ step: null, assignee }),
        onNotice: (message) => toast({ tone: "error", message }),
      }
    : undefined;

  const copyAsIs = async () => {
    setBusy(true);
    try {
      for (const s of by.asis) await api.createItem(project.id, { type: "process_step", variant: "tobe", no: s.no, assignee: s.assignee, content: s.content, next_nos: s.next_nos });
      await reloadItems();
      toast({ tone: "success", message: `AsIs の ${by.asis.length} 件を ToBe にコピーしました。ToBe の形に編集してください。` });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const options = [
    { value: "asis" as const, label: variantLabel("asis"), count: by.asis.length },
    { value: "tobe" as const, label: variantLabel("tobe"), count: by.tobe.length },
    { value: "compare" as const, label: "並べて比較" },
  ];

  const body = () => {
    if (view === "compare") {
      const stat = (v: ProcessVariant) => ({ n: by[v].length, who: assigneesOf(by[v]).length, loops: loopCount(by[v]) });
      const a = stat("asis");
      const t = stat("tobe");
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="grid shrink-0 gap-2 lg:grid-cols-3">
            <Delta label="業務の数" a={a.n} b={t.n} />
            <Delta label="関わる担当者" a={a.who} b={t.who} />
            <Delta label="前に戻る流れ（手戻り）" a={a.loops} b={t.loops} />
          </div>
          {(["asis", "tobe"] as const).map((v) => (
            <Card key={v} className="flex min-h-0 flex-1 flex-col !p-3" title={`${variantLabel(v)} のフロー図`} actions={<span className="text-xs text-slate-500">{by[v].length} 件</span>}>
              <div className="min-h-0 flex-1">
                {by[v].length === 0 ? <EmptyState title={`${SHORT[v]} の業務がまだありません`} description={canEdit ? "上のタブで切り替えて登録してください。" : "編集者が登録すると、ここに出ます。"} /> : <ProcessFlow steps={by[v]} label={variantLabel(v)} />}
              </div>
            </Card>
          ))}
        </div>
      );
    }
    const v = view;
    const steps = by[v];
    const lanes = assigneesOf(steps);
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Card className="flex min-h-[15rem] flex-[5] flex-col !p-4" title={`${variantLabel(v)} のフロー図`} actions={steps.length > 0 ? <Legend /> : undefined}>
          {steps.length === 0 ? (
            <EmptyState
              title={`${SHORT[v]} の業務がまだありません`}
              description={canEdit ? "下の入力欄に、業務No・担当者・業務内容を入れて Enter で追加すると、担当者ごとのレーンにフロー図ができあがります。" : "編集者が業務を登録すると、ここにフロー図が出ます。"}
              action={canEdit && v === "tobe" && by.asis.length > 0 ? (
                <Button variant="outline" onClick={() => void copyAsIs()} disabled={busy}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  AsIs をコピーして始める
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="min-h-0 flex-1">
              <ProcessFlow steps={steps} label={variantLabel(v)} selectedId={selectedId} onSelect={select} edit={flowEdit} />
            </div>
          )}
        </Card>
        <Card className="flex min-h-[12rem] flex-[4] flex-col !p-4" title="業務の一覧" actions={canEdit ? <Button size="sm" variant="outline" onClick={() => setModal({ step: null })}><Plus className="h-4 w-4" aria-hidden="true" />詳しく追加</Button> : undefined}>
          {steps.length > 0 && (
            <div className="hidden shrink-0 gap-3 px-3 pb-1 text-xs font-semibold text-slate-500 sm:flex">
              <span className="w-12 text-center">No</span><span className="w-36">担当者</span><span className="flex-1">業務内容</span><span className="w-32">次の業務</span><span className="w-[4.5rem]" />
            </div>
          )}
          <ul className="thin-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {steps.map((s) => (
              <StepRow key={`${s.id}-${s.updated_at}`} step={s} all={steps} lanes={lanes} selected={s.id === selectedId} canEdit={canEdit} onSelect={() => select(s.id === selectedId ? null : s.id)} onEdit={() => setModal({ step: s })} onDelete={() => setDeleting(s)} />
            ))}
          </ul>
          {canEdit && <QuickAdd key={v} variant={v} steps={steps} assignees={allAssignees} />}
        </Card>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Segmented kind="tabs" label="AsIs / ToBe の切り替え" options={options} value={view} onChange={setView} />
        <p className="text-xs text-slate-500">業務をクリックすると、つながる矢印と一覧の行が強調されます。{canEdit && "図の上では、業務をドラッグして並べ替え、右端の ● から矢印を引き、ダブルクリックで編集・追加できます。"}</p>
      </div>
      {body()}
      {modal && view !== "compare" && (
        <StepModal key={modal.step?.id ?? `new-${modal.assignee ?? ""}`} step={modal.step} variant={view} steps={by[view]} assignees={allAssignees} initialAssignee={modal.assignee} onClose={() => setModal(null)} />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="業務を削除しますか？"
        description={deleting ? `業務${deleting.no}「${deleting.content}」を削除します。他の業務の「次の業務No」からも外れます。` : ""}
        confirmLabel="削除する"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
