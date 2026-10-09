"use client";

import { AlertCircle, Check, CircleDashed, Lightbulb, Minus, Pencil, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api, errorMessage, type Request } from "@/lib/api/client";
import { PRIORITY, REQUEST_ACTION, REQUEST_KIND, labelOf } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Field from "../../../components/ui/Field";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Segmented from "../../../components/ui/Segmented";
import Select from "../../../components/ui/Select";
import { EmptyState } from "../../../components/ui/States";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";

type Kind = Request["kind"];
type Priority = Request["priority"];
type Action = Request["action"];
type Draft = { kind: Kind; title: string; description: string; requester: string; priority: Priority };
type Filter = "all" | Action;

const emptyDraft: Draft = { kind: "request", title: "", description: "", requester: "", priority: "medium" };
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_DOT: Record<Priority, string> = { high: "bg-rose-500", medium: "bg-amber-400", low: "bg-slate-300" };

/** Per decision state: the card's left stripe, the summary tile accent and the status pill. Undecided stands out on purpose — it is the to-do. */
const ACTION_STYLE: Record<Action, { Icon: typeof Check; stripe: string; pill: string; tile: string; bar: string }> = {
  undecided: { Icon: CircleDashed, stripe: "bg-amber-400", pill: "bg-amber-50 text-amber-800 ring-amber-200", tile: "text-amber-600", bar: "bg-amber-400" },
  needed: { Icon: Check, stripe: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", tile: "text-emerald-600", bar: "bg-emerald-500" },
  not_needed: { Icon: Minus, stripe: "bg-slate-300", pill: "bg-slate-100 text-slate-600 ring-slate-200", tile: "text-slate-500", bar: "bg-slate-300" },
};
const KIND_ICON: Record<Kind, { Icon: typeof Lightbulb; tone: string }> = {
  request: { Icon: Lightbulb, tone: "bg-indigo-50 text-indigo-600" },
  issue: { Icon: AlertCircle, tone: "bg-orange-50 text-orange-600" },
};

function RequestModal({ item, initial, onClose }: { item: Request | null; initial?: Draft; onClose: () => void }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(item ? { kind: item.kind, title: item.title, description: item.description, requester: item.requester, priority: item.priority } : (initial ?? emptyDraft));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...d, title: d.title.trim(), requester: d.requester.trim() };
      if (item) await api.updateItem(project.id, item.id, body);
      else await api.createItem(project.id, { type: "request", ...body });
      await reloadItems();
      toast({ tone: "success", message: item ? "保存しました。" : `${labelOf(REQUEST_KIND, d.kind)}を登録しました。` });
      onClose();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <Modal open title={item ? "要望・課題を編集" : "要望・課題を詳しく登録"} onClose={onClose} className="max-w-xl">
      <div className="space-y-4">
        <Segmented label="種類" options={REQUEST_KIND} value={d.kind} onChange={(v) => set("kind", v)} />
        <Field label="件名" htmlFor="rq-title" required>
          <Input id="rq-title" value={d.title} maxLength={100} placeholder="例: 月次集計に時間がかかる" onChange={(e) => set("title", e.target.value)} disabled={busy} />
        </Field>
        <Field label="内容" htmlFor="rq-desc" hint="困っていること、背景、望む状態など">
          <Textarea id="rq-desc" rows={4} value={d.description} maxLength={1000} onChange={(e) => set("description", e.target.value)} disabled={busy} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="誰からの声か" htmlFor="rq-req">
            <Input id="rq-req" value={d.requester} maxLength={50} placeholder="例: 経理部 山田さん" onChange={(e) => set("requester", e.target.value)} disabled={busy} />
          </Field>
          <Field label="優先度" htmlFor="rq-prio">
            <Select id="rq-prio" value={d.priority} options={PRIORITY.map((p) => ({ value: p.value, label: p.label }))} onChange={(e) => set("priority", e.target.value as Priority)} disabled={busy} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>キャンセル</Button>
          <Button onClick={() => void save()} disabled={busy || !d.title.trim()}>{item ? "保存" : "登録"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function QuickCapture({ onDetail }: { onDetail: (d: Draft) => void }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>("request");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.createItem(project.id, { type: "request", kind, title: title.trim() });
      setTitle("");
      await reloadItems();
      toast({ tone: "success", message: `${labelOf(REQUEST_KIND, kind)}を登録しました。続けて入力できます。` });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => ref.current?.focus());
    }
  };
  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 card-shadow sm:flex-row sm:items-center">
      <Segmented label="種類" size="sm" options={REQUEST_KIND} value={kind} onChange={setKind} />
      <Input
        ref={ref}
        aria-label="件名"
        className="min-w-0 sm:flex-1"
        placeholder={kind === "request" ? "要望を一言で入力して Enter（例: 受注画面にバーコード読取を付けたい）" : "課題を一言で入力して Enter（例: 月次集計に 3 日かかる）"}
        value={title}
        maxLength={100}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) void add();
        }}
        disabled={busy}
      />
      <div className="flex gap-2">
        <Button onClick={() => void add()} disabled={busy || !title.trim()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          登録
        </Button>
        <Button variant="outline" onClick={() => onDetail({ ...emptyDraft, kind, title })}>詳しく</Button>
      </div>
    </div>
  );
}

function RequestCard({ item, onEdit, onDelete }: { item: Request; onEdit: () => void; onDelete: () => void }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [reason, setReason] = useState(item.action_reason);
  const [busy, setBusy] = useState(false);
  const st = ACTION_STYLE[item.action];
  const k = KIND_ICON[item.kind];

  const patch = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      await api.updateItem(project.id, item.id, body);
      await reloadItems();
      toast({ tone: "success", message });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };
  const decide = (a: Action) => void patch({ action: a }, a === "undecided" ? "未判断に戻しました。" : `「${labelOf(REQUEST_ACTION, a)}」と判断しました。`);

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white card-shadow transition hover:border-slate-300">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", st.stripe)} aria-hidden="true" />
      <div className="flex flex-col gap-2 py-2.5 pl-5 pr-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={cn("mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", k.tone)} title={labelOf(REQUEST_KIND, item.kind)}>
            <k.Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-sm font-bold leading-snug text-slate-900">{item.title}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-600">{labelOf(REQUEST_KIND, item.kind)}</span>
              <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[item.priority])} aria-hidden="true" />優先度 {labelOf(PRIORITY, item.priority)}</span>
              {item.requester && <span>{item.requester}</span>}
              <span>{formatDate(item.created_at)} 登録</span>
            </div>
            {item.description && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600" title={item.description}>{item.description}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 lg:pl-0">
          {item.action === "undecided" ? (
            <>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1", st.pill)}>
                <st.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {labelOf(REQUEST_ACTION, item.action)}
              </span>
              <Button size="sm" onClick={() => decide("needed")} disabled={busy} aria-label="対応要にする"><Check className="h-4 w-4" aria-hidden="true" />対応要</Button>
              <Button size="sm" variant="outline" onClick={() => decide("not_needed")} disabled={busy} aria-label="対応不要にする"><Minus className="h-4 w-4" aria-hidden="true" />対応不要</Button>
            </>
          ) : (
            <>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1", st.pill)}>
                <st.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {labelOf(REQUEST_ACTION, item.action)}
              </span>
              <Input
                aria-label="判断の理由"
                className="h-8 w-48 xl:w-60"
                placeholder="判断の理由（任意）"
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => reason !== item.action_reason && void patch({ action_reason: reason.trim() }, "理由を保存しました。")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
                }}
                disabled={busy}
              />
              {item.action === "needed" ? (
                <Button size="sm" variant="outline" onClick={() => decide("not_needed")} disabled={busy}>対応不要に変更</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => decide("needed")} disabled={busy}>対応要に変更</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => decide("undecided")} disabled={busy} title="未判断に戻す"><Undo2 className="h-4 w-4" aria-hidden="true" />戻す</Button>
            </>
          )}
          <div className="flex shrink-0 items-center sm:opacity-0 sm:transition sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${item.title}を編集`} title="編集" onClick={onEdit} disabled={busy}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${item.title}を削除`} title="削除" onClick={onDelete} disabled={busy}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </li>
  );
}

function SummaryTiles({ requests, filter, onFilter }: { requests: Request[]; filter: Filter; onFilter: (f: Filter) => void }) {
  const total = requests.length;
  const n = (a: Action) => requests.filter((r) => r.action === a).length;
  const tiles: { value: Filter; label: string; count: number; accent: string }[] = [
    { value: "all", label: "すべて", count: total, accent: "text-slate-900" },
    ...REQUEST_ACTION.map((a) => ({ value: a.value as Filter, label: a.label, count: n(a.value), accent: ACTION_STYLE[a.value].tile })),
  ];
  return (
    <div className="shrink-0 space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={filter === t.value}
            onClick={() => onFilter(t.value)}
            className={cn(
              "flex items-center justify-between rounded-xl border bg-white px-4 py-2 text-left card-shadow transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
              filter === t.value ? "border-primary ring-2 ring-primary/20" : "border-slate-200 hover:border-slate-300",
            )}
          >
            <span className="text-xs font-semibold text-slate-500">{t.label}</span>
            <span className={cn("text-2xl font-extrabold tabular-nums leading-none", t.accent)}>{t.count}</span>
          </button>
        ))}
      </div>
      {total > 0 && (
        <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`判断済み ${total - n("undecided")} / ${total} 件`}>
          {REQUEST_ACTION.map((a) => <div key={a.value} className={cn("h-full transition-all duration-500", ACTION_STYLE[a.value].bar)} style={{ width: `${(n(a.value) / total) * 100}%` }} />)}
        </div>
      )}
    </div>
  );
}

export default function RequestsPage() {
  const { project, items, reloadItems } = useProject();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [sort, setSort] = useState<"created" | "priority">("created");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ item: Request | null; initial?: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Request | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.requests.filter((r) =>
      (filter === "all" || r.action === filter) && (kind === "all" || r.kind === kind) &&
      (!q || [r.title, r.description, r.requester].some((t) => t.toLowerCase().includes(q))));
    return sort === "priority" ? [...list].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) : list;
  }, [items.requests, filter, kind, sort, query]);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteItem(project.id, deleting.id);
      setDeleting(null);
      await reloadItems();
      toast({ tone: "success", message: `${labelOf(REQUEST_KIND, deleting.kind)}を削除しました。` });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const undecided = items.requests.filter((r) => r.action === "undecided").length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <QuickCapture onDetail={(initial) => setModal({ item: null, initial })} />
      <SummaryTiles requests={items.requests} filter={filter} onFilter={setFilter} />

      <Card
        className="flex min-h-0 flex-1 flex-col !p-4"
        title={undecided > 0 ? `要望・課題の一覧（判断待ち ${undecided} 件）` : "要望・課題の一覧"}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input aria-label="検索" className="h-9 w-48 pl-9" placeholder="検索" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Segmented label="種類で絞り込み" size="sm" value={kind} onChange={setKind} options={[{ value: "all", label: "すべて" }, ...REQUEST_KIND]} />
            <Segmented label="並び順" size="sm" value={sort} onChange={setSort} options={[{ value: "created", label: "登録順" }, { value: "priority", label: "優先度順" }]} />
          </>
        }
      >
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        {shown.length === 0 ? (
          <EmptyState
            title={items.requests.length === 0 ? "要望・課題はまだありません" : "該当するものはありません"}
            description={items.requests.length === 0 ? "上の入力欄に一言入れて Enter で登録できます。登録したら、対応するかどうかをここで判断します。" : "絞り込みや検索の条件を変えてみてください。"}
          />
        ) : (
          <ul className="space-y-2">{shown.map((r) => <RequestCard key={`${r.id}-${r.updated_at}`} item={r} onEdit={() => setModal({ item: r })} onDelete={() => setDeleting(r)} />)}</ul>
        )}
        </div>
      </Card>

      {modal && <RequestModal key={modal.item?.id ?? "new"} item={modal.item} initial={modal.initial} onClose={() => setModal(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `${labelOf(REQUEST_KIND, deleting.kind)}を削除しますか？` : ""}
        description={deleting ? `「${deleting.title}」を削除します。元に戻せません。` : ""}
        confirmLabel="削除する"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
