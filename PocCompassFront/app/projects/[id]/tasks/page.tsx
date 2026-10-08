"use client";

import { ClipboardPaste, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage, type Evaluation, type Task } from "@/lib/api/client";
import { TASK_STATUS, VERDICT_LABEL, scoreColor } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Select from "../../../components/ui/Select";
import { EmptyState } from "../../../components/ui/States";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";
import ExtractPanel from "./ExtractPanel";
import TaskForm, { draftFromTask, emptyDraft, type TaskDraft } from "./TaskForm";

type Editing = { kind: "new" } | { kind: "edit"; task: Task } | null;

export default function TasksPage() {
  const { project, items, mode, version, reloadItems } = useProject();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [extractOpen, setExtractOpen] = useState(false);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const lb = mode.labels;

  const loadEval = useCallback(async () => {
    try {
      setEvaluation(await api.latestEvaluation(project.id));
    } catch {
      setEvaluation(null); // verdicts are optional decoration on this screen
    }
  }, [project.id]);

  useEffect(() => {
    void loadEval();
  }, [loadEval, version]);

  const results = useMemo(() => new Map((evaluation?.task_results ?? []).map((r) => [r.task_id, r])), [evaluation]);
  const aText = useMemo(() => new Map(items.assumptions.map((a) => [a.id, a.text])), [items.assumptions]);
  const cText = useMemo(() => new Map(items.criteria.map((c) => [c.id, c.text])), [items.criteria]);

  const save = async (d: TaskDraft): Promise<boolean> => {
    try {
      if (editing?.kind === "edit") {
        await api.updateItem(project.id, editing.task.id, {
          ...d,
          clear_effort_hours: d.effort_hours == null,
          clear_due_date: d.due_date == null,
        });
        toast({ tone: "success", message: `${lb.task}を更新しました。` });
      } else {
        await api.createItem(project.id, { type: "task", ...d });
        toast({ tone: "success", message: `${lb.task}を登録しました。` });
      }
      setEditing(null);
      await reloadItems();
      return true;
    } catch (e) {
      toast({ tone: "error", title: "保存できませんでした", message: errorMessage(e) });
      return false;
    }
  };

  const changeStatus = async (t: Task, status: string) => {
    try {
      await api.updateItem(project.id, t.id, { status });
      await reloadItems();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api.deleteItem(project.id, deleting.id);
      toast({ tone: "success", message: `${lb.task}を削除しました。` });
      setDeleting(null);
      await reloadItems();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusyDelete(false);
    }
  };

  const evaluatedAt = evaluation ? new Date(evaluation.created_at).getTime() : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          進行中・予定の作業を登録します。AI は各{lb.task}が{lb.goal}・{lb.assumption}・{lb.criterion}に必要かを判定します。
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setExtractOpen(true); setEditing(null); }} disabled={extractOpen}>
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            週報・議事録から取り込む
          </Button>
          <Button onClick={() => { setEditing({ kind: "new" }); setExtractOpen(false); }} disabled={editing?.kind === "new"}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {lb.task}を追加
          </Button>
        </div>
      </div>

      {extractOpen && <ExtractPanel onClose={() => setExtractOpen(false)} />}

      {editing && (
        <Card title={editing.kind === "new" ? `${lb.task}を追加` : `${lb.task}を編集`}>
          <TaskForm
            key={editing.kind === "edit" ? editing.task.id : "new"}
            initial={editing.kind === "edit" ? draftFromTask(editing.task) : emptyDraft()}
            labels={lb}
            placeholder={mode.placeholders.task}
            assumptions={items.assumptions}
            criteria={items.criteria}
            submitLabel={editing.kind === "new" ? "登録する" : "更新する"}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}

      {items.tasks.length === 0 ? (
        !editing && !extractOpen && (
          <EmptyState
            title={`${lb.task}がまだありません`}
            description={`「${lb.task}を追加」から登録するか、週報・議事録を貼り付けて取り込んでください。`}
          />
        )
      ) : (
        <ul className="space-y-3">
          {items.tasks.map((t) => {
            const r = results.get(t.id);
            const changed = r && new Date(t.updated_at).getTime() > evaluatedAt;
            return (
              <li key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {r && !changed ? (
                        <>
                          <Badge variant={VERDICT_LABEL[r.verdict].variant}>{VERDICT_LABEL[r.verdict].label}</Badge>
                          <span className={cn("text-xs font-semibold tabular-nums", scoreColor(r.alignment_score))}>整合 {r.alignment_score}</span>
                        </>
                      ) : (
                        <Badge variant="slate">{changed ? "変更あり・再評価待ち" : "未評価"}</Badge>
                      )}
                      <h3 className={cn("break-words font-semibold text-slate-900", t.status === "done" && "text-slate-500 line-through")}>{t.title}</h3>
                    </div>
                    {t.description && <p className="whitespace-pre-line text-sm text-slate-600">{t.description}</p>}
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {t.linked_assumption_ids.map((id) => (
                        <span key={id} className="max-w-[20rem] truncate rounded bg-accent px-1.5 py-0.5 text-accent-foreground" title={aText.get(id)}>
                          {lb.assumption}: {aText.get(id)}
                        </span>
                      ))}
                      {t.linked_criterion_ids.map((id) => (
                        <span key={id} className="max-w-[20rem] truncate rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800" title={cText.get(id)}>
                          {lb.criterion}: {cText.get(id)}
                        </span>
                      ))}
                      {t.effort_hours != null && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">工数 {t.effort_hours}h</span>}
                      {t.due_date && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">期日 {formatDate(t.due_date)}</span>}
                    </div>
                    {r && !changed && r.verdict !== "aligned" && (
                      <div className="rounded-md bg-slate-50 p-2.5 text-sm">
                        <p className="text-slate-700">{r.reason}</p>
                        {r.suggested_action && (
                          <p className="mt-1 flex items-start gap-1.5 text-primary">
                            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            {r.suggested_action}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Select
                      aria-label={`${t.title} の状態`}
                      className="w-28"
                      value={t.status}
                      options={[...TASK_STATUS]}
                      onChange={(e) => void changeStatus(t, e.target.value)}
                    />
                    <Button variant="ghost" size="icon" aria-label={`${t.title} を編集`} title="編集" onClick={() => { setEditing({ kind: "edit", task: t }); setExtractOpen(false); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`${t.title} を削除`} title="削除" onClick={() => setDeleting(t)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`${lb.task}を削除しますか？`}
        description={`「${deleting?.title ?? ""}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        tone="danger"
        busy={busyDelete}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
