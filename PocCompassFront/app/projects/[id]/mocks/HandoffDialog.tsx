"use client";

import { Download, Loader2, Save, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage, type Screen, type ScreenVersionMeta } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils";
import Button from "../../../components/ui/Button";
import Field from "../../../components/ui/Field";
import Modal from "../../../components/ui/Modal";
import Segmented from "../../../components/ui/Segmented";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";

type Doc = "screen_spec" | "acceptance" | "agents";
type Pack = { version_id: string; tech_notes: string; screen_spec: string; acceptance: string; agents: string };

const DOCS: { value: Doc; label: string; file: string }[] = [
  { value: "screen_spec", label: "画面仕様", file: "SCREEN_SPEC.md" },
  { value: "acceptance", label: "受け入れ条件", file: "ACCEPTANCE.md" },
  { value: "agents", label: "作業指示", file: "AGENTS.md" },
];

export async function downloadHandoff(projectId: string, screen: Screen) {
  const blob = await api.exportHandoff(projectId, screen.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${screen.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "screen"}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/** SPEC §18.6: the AI drafts, a person edits and saves; only the saved pack is exported. */
export default function HandoffDialog({
  open,
  screen,
  versions,
  defaultVersionId,
  onClose,
  onSaved,
}: {
  open: boolean;
  screen: Screen;
  versions: ScreenVersionMeta[];
  defaultVersionId: string | null;
  onClose: () => void;
  onSaved: (s: Screen) => void;
}) {
  const { project, canEdit } = useProject();
  const { toast } = useToast();
  const saved = screen.handoff;
  const [pack, setPack] = useState<Pack | null>(null);
  const [techNotes, setTechNotes] = useState("");
  const [tab, setTab] = useState<Doc>("screen_spec");
  const [busy, setBusy] = useState<"draft" | "save" | "download" | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPack(saved ? { ...saved } : null);
    setTechNotes(saved?.tech_notes ?? "");
    setDirty(false);
    setTab("screen_spec");
  }, [open, saved]);

  const versionNo = (id: string | undefined) => versions.find((v) => v.id === id)?.no;

  const draft = async () => {
    setBusy("draft");
    try {
      const d = await api.draftHandoff(project.id, screen.id, techNotes, defaultVersionId);
      setPack({ ...d, tech_notes: techNotes });
      setDirty(true);
      toast({ tone: "success", message: "下書きを作成しました。内容を確認・修正してから保存してください。" });
    } catch (e) {
      toast({ tone: "error", title: "下書きの作成に失敗しました", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!pack) return;
    setBusy("save");
    try {
      const s = await api.saveHandoff(project.id, screen.id, { ...pack, tech_notes: techNotes });
      onSaved(s);
      setDirty(false);
      toast({ tone: "success", message: "引き渡しパックを保存しました。ZIP をダウンロードできます。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("download");
    try {
      await downloadHandoff(project.id, screen);
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const current = DOCS.find((d) => d.value === tab)!;

  return (
    <Modal open={open} title={`引き渡しパック: ${screen.name}`} onClose={onClose} className="max-w-5xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          モック（mock.html）と、画面仕様・受け入れ条件・作業指示をまとめた ZIP を作ります。Codex などのコーディングエージェントに、フォルダごと渡して実装を依頼できます。
        </p>

        {canEdit && (
          <div className="space-y-2 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
            <Field label="前提（技術・制約）" htmlFor="tech-notes" hint="例: Next.js + Tailwind、API は FastAPI。既存の共通部品を使う。IE 対応不要。">
              <Textarea
                id="tech-notes"
                rows={2}
                maxLength={2000}
                value={techNotes}
                onChange={(e) => {
                  setTechNotes(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void draft()} disabled={busy !== null} aria-busy={busy === "draft"}>
                {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                {busy === "draft" ? "AI が下書き中（数十秒かかります）" : pack ? "AI で下書きし直す" : "AI で下書き"}
              </Button>
              <span className="text-xs text-slate-500">
                対象: {defaultVersionId ? `採用した版（v${versionNo(defaultVersionId)}）` : "最新の版"}。下書きは保存されません。
              </span>
            </div>
          </div>
        )}

        {pack ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented label="文書" kind="tabs" size="sm" options={DOCS} value={tab} onChange={setTab} />
              <span className="text-xs text-slate-500">
                {current.file}・モックは v{versionNo(pack.version_id) ?? "?"}
              </span>
            </div>
            <label htmlFor="handoff-doc" className="sr-only">
              {current.label}
            </label>
            <Textarea
              id="handoff-doc"
              rows={16}
              value={pack[tab]}
              readOnly={!canEdit}
              maxLength={20000}
              onChange={(e) => {
                setPack({ ...pack, [tab]: e.target.value });
                setDirty(true);
              }}
              className="font-mono text-[13px] leading-6"
            />
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {canEdit ? "「AI で下書き」を押すと、モックとヒアリングの記録から文書の下書きを作ります。" : "引き渡しパックはまだ保存されていません。"}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">
            {saved ? `保存済み: ${formatDateTime(saved.updated_at)}` : "未保存"}
            {dirty && "（未保存の変更があります）"}
          </span>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => void save()} disabled={!pack || !dirty || busy !== null}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                保存
              </Button>
            )}
            <Button
              onClick={() => void download()}
              disabled={!saved || dirty || busy !== null}
              title={!saved ? "保存してからダウンロードできます" : dirty ? "変更を保存してからダウンロードしてください" : undefined}
            >
              {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              ZIP をダウンロード
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
