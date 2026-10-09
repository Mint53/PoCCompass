"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api, errorMessage, type Request } from "@/lib/api/client";
import { PRIORITY, REQUEST_ACTION, REQUEST_KIND, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";
import Badge, { type BadgeVariant } from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Field from "../../../components/ui/Field";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import { EmptyState } from "../../../components/ui/States";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";

type Kind = Request["kind"];
type Priority = Request["priority"];
type Action = Request["action"];
type Draft = { kind: Kind; title: string; description: string; requester: string; priority: Priority };

const emptyDraft: Draft = { kind: "request", title: "", description: "", requester: "", priority: "medium" };
const KIND_BADGE: Record<Kind, BadgeVariant> = { request: "brand", issue: "orange" };
const ACTION_BADGE: Record<Action, BadgeVariant> = { undecided: "slate", needed: "green", not_needed: "outline" };

function DraftFields({ idPrefix, draft, onChange, disabled }: { idPrefix: string; draft: Draft; onChange: (d: Draft) => void; disabled: boolean }) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <Field label="種類" htmlFor={`${idPrefix}-kind`}>
          <Select id={`${idPrefix}-kind`} value={draft.kind} options={[...REQUEST_KIND]} onChange={(e) => set("kind", e.target.value as Kind)} disabled={disabled} />
        </Field>
        <Field label="件名" htmlFor={`${idPrefix}-title`} required>
          <Input id={`${idPrefix}-title`} value={draft.title} maxLength={100} placeholder="例: 月次集計に時間がかかる" onChange={(e) => set("title", e.target.value)} disabled={disabled} />
        </Field>
      </div>
      <Field label="内容" htmlFor={`${idPrefix}-desc`}>
        <Textarea id={`${idPrefix}-desc`} value={draft.description} maxLength={1000} placeholder="困っていること、背景、望む状態など" onChange={(e) => set("description", e.target.value)} disabled={disabled} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="誰からの声か" htmlFor={`${idPrefix}-req`}>
          <Input id={`${idPrefix}-req`} value={draft.requester} maxLength={50} placeholder="例: 経理部 山田さん" onChange={(e) => set("requester", e.target.value)} disabled={disabled} />
        </Field>
        <Field label="優先度" htmlFor={`${idPrefix}-prio`}>
          <Select id={`${idPrefix}-prio`} value={draft.priority} options={PRIORITY.map((p) => ({ value: p.value, label: p.label }))} onChange={(e) => set("priority", e.target.value as Priority)} disabled={disabled} />
        </Field>
      </div>
    </div>
  );
}

function AddCard() {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      await api.createItem(project.id, { type: "request", ...draft, title: draft.title.trim(), requester: draft.requester.trim() });
      setDraft(emptyDraft);
      await reloadItems();
      toast({ tone: "success", message: `${labelOf(REQUEST_KIND, draft.kind)}を登録しました。` });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="要望・課題を登録"
      actions={
        <Button size="sm" onClick={() => void add()} disabled={busy || !draft.title.trim()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          登録
        </Button>
      }
    >
      <DraftFields idPrefix="new-req" draft={draft} onChange={setDraft} disabled={busy} />
    </Card>
  );
}

function RequestCard({ item }: { item: Request }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ kind: item.kind, title: item.title, description: item.description, requester: item.requester, priority: item.priority });
  const [reason, setReason] = useState(item.action_reason);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const patch = async (body: Record<string, unknown>, message: string): Promise<boolean> => {
    setBusy(true);
    try {
      await api.updateItem(project.id, item.id, body);
      await reloadItems();
      toast({ tone: "success", message });
      return true;
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
      return false;
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteItem(project.id, item.id);
      setConfirm(false);
      await reloadItems();
      toast({ tone: "success", message: `${labelOf(REQUEST_KIND, item.kind)}を削除しました。` });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="space-y-4 rounded-xl border border-primary/30 bg-white p-4">
        <DraftFields idPrefix={`edit-${item.id}`} draft={draft} onChange={setDraft} disabled={busy} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={busy}>キャンセル</Button>
          <Button size="sm" disabled={busy || !draft.title.trim()} onClick={() => void patch({ ...draft, title: draft.title.trim(), requester: draft.requester.trim() }, "保存しました。").then((ok) => ok && setEditing(false))}>
            保存
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={KIND_BADGE[item.kind]}>{labelOf(REQUEST_KIND, item.kind)}</Badge>
            <Badge variant="outline">優先度 {labelOf(PRIORITY, item.priority)}</Badge>
            <Badge variant={ACTION_BADGE[item.action]}>{labelOf(REQUEST_ACTION, item.action)}</Badge>
            {item.requester && <span className="text-xs text-slate-600">{item.requester}</span>}
          </div>
          <h3 className="break-words text-sm font-bold text-slate-900">{item.title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={`${item.title}を編集`} title="編集" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`${item.title}を削除`} title="削除" onClick={() => setConfirm(true)} disabled={busy}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {item.description && <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.description}</p>}
      <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 lg:flex-row lg:items-center">
        <div role="group" aria-label="対応の要否" className="inline-flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
          {REQUEST_ACTION.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-pressed={item.action === a.value}
              disabled={busy}
              onClick={() => item.action !== a.value && void patch({ action: a.value }, `「${a.label}」にしました。`)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
                item.action === a.value ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:bg-white/60",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <Input aria-label="判断の理由" className="min-w-0 lg:flex-1" placeholder="判断の理由（任意）" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} disabled={busy} />
        <Button size="sm" variant="outline" disabled={busy || reason === item.action_reason} onClick={() => void patch({ action_reason: reason.trim() }, "理由を保存しました。")}>
          理由を保存
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title={`${labelOf(REQUEST_KIND, item.kind)}を削除しますか？`}
        description={`「${item.title}」を削除します。元に戻せません。`}
        confirmLabel="削除する"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </li>
  );
}

const FILTERS = [{ value: "all", label: "すべて" }, ...REQUEST_ACTION] as const;

export default function RequestsPage() {
  const { items } = useProject();
  const [filter, setFilter] = useState<string>("all");
  const count = (v: string) => (v === "all" ? items.requests.length : items.requests.filter((r) => r.action === v).length);
  const shown = useMemo(() => items.requests.filter((r) => filter === "all" || r.action === filter), [items.requests, filter]);

  return (
    <div className="space-y-6">
      <AddCard />
      <Card title="要望・課題の一覧">
        <div role="group" aria-label="対応の要否で絞り込み" className="mb-3 inline-flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition",
                filter === f.value ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:bg-white/60",
              )}
            >
              {f.label}
              <span className="rounded-full bg-slate-100 px-1.5 text-xs tabular-nums text-slate-600">{count(f.value)}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <EmptyState
            title={items.requests.length === 0 ? "要望・課題はまだありません" : "該当するものはありません"}
            description={items.requests.length === 0 ? "上のフォームから登録し、対応が必要かどうかを判断していきます。" : undefined}
          />
        ) : (
          <ul className="space-y-3">{shown.map((r) => <RequestCard key={`${r.id}-${r.updated_at}`} item={r} />)}</ul>
        )}
      </Card>
    </div>
  );
}
