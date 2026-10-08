"use client";

import { Loader2, Wand2 } from "lucide-react";
import { useState } from "react";
import { api, errorMessage, type ExtractedTask } from "@/lib/api/client";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Field from "../../../components/ui/Field";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";

const MAX = 8000;

/** SPEC §8: paste a weekly report / minutes -> AI proposes tasks -> user picks -> bulk create. Nothing is saved until confirmed. */
export default function ExtractPanel({ onClose }: { onClose: () => void }) {
  const { project, mode, reloadItems } = useProject();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<(ExtractedTask & { checked: boolean })[] | null>(null);
  const [busy, setBusy] = useState<"extract" | "save" | null>(null);
  const lb = mode.labels;

  const extract = async () => {
    if (!text.trim()) return;
    setBusy("extract");
    try {
      const res = await api.extractTasks(project.id, text);
      setCandidates(res.tasks.map((t) => ({ ...t, checked: true })));
      if (res.tasks.length === 0) toast({ tone: "info", message: `新しい${lb.task}は見つかりませんでした。` });
    } catch (e) {
      toast({ tone: "error", title: "抽出に失敗しました", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const chosen = (candidates ?? []).filter((c) => c.checked);
    if (!chosen.length) return;
    setBusy("save");
    try {
      await api.bulkCreateTasks(
        project.id,
        chosen.map(({ checked: _checked, ...t }) => ({ type: "task", status: "todo", effort_hours: null, start_date: null, due_date: null, ...t })),
      );
      toast({ tone: "success", message: `${chosen.length} 件の${lb.task}を登録しました。「AI で評価」で判定できます。` });
      await reloadItems();
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "登録できませんでした", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title={`週報・議事録から${lb.task}を取り込む`}>
      <div className="space-y-4">
        <Field label="テキスト" htmlFor="extract-text" hint={`貼り付けた文章から AI が${lb.task}の候補を抜き出します。確認してから登録されます（最大 ${MAX} 字、現在 ${text.length} 字）。`}>
          <Textarea id="extract-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} disabled={busy !== null} />
        </Field>
        {text.length > MAX && <p className="text-xs text-rose-700" role="alert">{MAX} 字を超えています。分けて取り込んでください。</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy !== null}>
            閉じる
          </Button>
          <Button onClick={() => void extract()} disabled={busy !== null || !text.trim() || text.length > MAX}>
            {busy === "extract" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
            {busy === "extract" ? "抽出中..." : "候補を抽出"}
          </Button>
        </div>
        {candidates && candidates.length > 0 && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-800">登録する{lb.task}を選んでください</p>
            <ul className="space-y-2">
              {candidates.map((c, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[rgb(var(--primary))]"
                      checked={c.checked}
                      onChange={(e) => setCandidates((prev) => prev!.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))}
                    />
                    <span>
                      <span className="font-medium text-slate-900">{c.title}</span>
                      {c.description && <span className="block text-slate-600">{c.description}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={busy !== null || !candidates.some((c) => c.checked)}>
                {busy === "save" ? "登録中..." : `選んだ ${candidates.filter((c) => c.checked).length} 件を登録`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
