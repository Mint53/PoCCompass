"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, errorMessage, type Assumption, type Evidence } from "@/lib/api/client";
import { ASSUMPTION_STATUS, EVIDENCE_RESULT, PRIORITY, labelOf } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
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

const RESULT_VARIANT: Record<string, BadgeVariant> = { supports: "green", refutes: "red", inconclusive: "slate" };

function AssumptionBlock({ a, evidence }: { a: Assumption; evidence: Evidence[] }) {
  const { project, mode, reloadItems } = useProject();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState("supports");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Evidence | null>(null);
  const lb = mode.labels;

  const add = async () => {
    if (!summary.trim()) return;
    setBusy(true);
    try {
      await api.createItem(project.id, {
        type: "evidence",
        assumption_id: a.id,
        summary: summary.trim(),
        result: result as Evidence["result"],
        source: source.trim(),
      });
      if (a.status === "untested") await api.updateItem(project.id, a.id, { status: "testing" });
      setSummary("");
      setSource("");
      setOpen(false);
      await reloadItems();
      toast({ tone: "success", message: `${lb.evidence}を登録しました。` });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    try {
      await api.updateItem(project.id, a.id, { status });
      await reloadItems();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteItem(project.id, deleting.id);
      setDeleting(null);
      await reloadItems();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={a.priority === "high" ? "brand" : "outline"}>優先度 {labelOf(PRIORITY, a.priority)}</Badge>
            <Badge variant="slate">{lb.evidence} {evidence.length} 件</Badge>
          </div>
          <h2 className="break-words font-semibold text-slate-900">{a.text}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select aria-label={`${a.text} の検証状態`} className="w-32" value={a.status} options={[...ASSUMPTION_STATUS]} onChange={(e) => void setStatus(e.target.value)} />
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {lb.evidence}を追加
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
          <Field label="内容" htmlFor={`ev-${a.id}`} required>
            <Textarea id={`ev-${a.id}`} rows={2} value={summary} maxLength={1000} placeholder={mode.placeholders.evidence} onChange={(e) => setSummary(e.target.value)} disabled={busy} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`${lb.assumption}に対して`} htmlFor={`evr-${a.id}`}>
              <Select id={`evr-${a.id}`} value={result} options={[...EVIDENCE_RESULT]} onChange={(e) => setResult(e.target.value)} disabled={busy} />
            </Field>
            <Field label="出典（任意）" htmlFor={`evs-${a.id}`}>
              <Input id={`evs-${a.id}`} value={source} maxLength={500} placeholder="資料名・URL など" onChange={(e) => setSource(e.target.value)} disabled={busy} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>キャンセル</Button>
            <Button size="sm" onClick={() => void add()} disabled={busy || !summary.trim()}>{busy ? "登録中..." : "登録する"}</Button>
          </div>
        </div>
      )}

      {evidence.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {evidence.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={RESULT_VARIANT[e.result]}>{labelOf(EVIDENCE_RESULT, e.result)}</Badge>
                  <span className="text-xs text-slate-500">{formatDate(e.created_at)}</span>
                  {e.source && <span className="truncate text-xs text-slate-500" title={e.source}>出典: {e.source}</span>}
                </div>
                <p className="whitespace-pre-line text-sm text-slate-800">{e.summary}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="削除" title="削除" onClick={() => setDeleting(e)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`${lb.evidence}を削除しますか？`}
        description={deleting?.summary ?? ""}
        confirmLabel="削除する"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}

export default function EvidencePage() {
  const { project, items, mode } = useProject();
  if (items.assumptions.length === 0) {
    return (
      <EmptyState
        title={`${mode.labels.assumption}がありません`}
        description={`${mode.labels.evidence}は${mode.labels.assumption}ごとに登録します。先に設計画面で${mode.labels.assumption}を登録してください。`}
        action={<Link href={`/projects/${project.id}/design`} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">設計へ</Link>}
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {mode.labels.assumption}ごとに、裏付け・反証となる{mode.labels.evidence}を記録します。結論が出たら状態を「支持された／否定された」にしてください。
      </p>
      {items.assumptions.map((a) => (
        <AssumptionBlock key={a.id} a={a} evidence={items.evidence.filter((e) => e.assumption_id === a.id)} />
      ))}
    </div>
  );
}
