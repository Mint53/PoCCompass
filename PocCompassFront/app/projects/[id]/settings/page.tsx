"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage, type Mode } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Field from "../../../components/ui/Field";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import { useApp } from "../../../contexts/AppContext";
import { useProject } from "../ProjectContext";

export default function SettingsPage() {
  const { modes } = useApp();
  const { project, mode, isOwner, reloadProject, bump } = useProject();
  const { toast } = useToast();
  const router = useRouter();
  const [members, setMembers] = useState(project.members.join("\n"));
  const [savingMembers, setSavingMembers] = useState(false);
  const [nextMode, setNextMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMembers = async () => {
    const list = members.split(/[\s,、]+/).map((s) => s.trim()).filter(Boolean);
    const bad = list.filter((m) => !/^[^@\s]+@[^@\s]+$/.test(m));
    if (bad.length) {
      toast({ tone: "error", message: `メールアドレスの形式が正しくありません: ${bad.join(", ")}` });
      return;
    }
    setSavingMembers(true);
    try {
      await api.updateProject(project.id, { members: list });
      await reloadProject();
      toast({ tone: "success", message: "メンバーを保存しました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setSavingMembers(false);
    }
  };

  const changeMode = async () => {
    if (!nextMode) return;
    setBusy(true);
    try {
      await api.updateProject(project.id, { mode: nextMode });
      await reloadProject();
      bump();
      setNextMode(null);
      toast({ tone: "success", message: "モードを変更しました。次回の「AI で評価」から新しい基準で判定されます。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      toast({ tone: "success", message: "取り組みを削除しました。" });
      router.push("/");
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };

  const ownerNote = !isOwner ? <p className="text-xs text-slate-500">この設定は作成者（{project.owner_email}）または管理者のみ変更できます。</p> : null;

  return (
    <div className="space-y-6">
      <Card title="メンバー" actions={<Button size="sm" onClick={() => void saveMembers()} disabled={!isOwner || savingMembers}>{savingMembers ? "保存中..." : "保存"}</Button>}>
        <Field label="閲覧・編集できるメンバー（メールアドレス、1 行に 1 人）" htmlFor="members" hint="作成者は常に含まれます。">
          <Textarea id="members" rows={5} value={members} onChange={(e) => setMembers(e.target.value)} disabled={!isOwner || savingMembers} />
        </Field>
        {ownerNote}
      </Card>

      <Card title="モード">
        <p className="mb-3 text-sm text-slate-600">
          データはそのまま引き継がれ、項目名と AI の判定基準・健全度の重みが変わります。現在: <strong>{mode.name}</strong>
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setNextMode(m.id)}
              disabled={!isOwner || m.id === project.mode}
              className={cn(
                "rounded-xl border p-4 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed",
                m.id === project.mode ? "border-primary bg-accent" : "border-slate-200 bg-white hover:border-primary disabled:opacity-60",
              )}
            >
              <span className="block font-bold text-slate-900">{m.name}{m.id === project.mode && "（現在）"}</span>
              <span className="mt-1 block text-slate-600">{m.description}</span>
            </button>
          ))}
        </div>
        {ownerNote}
      </Card>

      <Card title="取り組みの削除">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">一覧から削除します。メンバー全員が閲覧できなくなります。</p>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={!isOwner}>
            削除する
          </Button>
        </div>
        {ownerNote}
      </Card>

      <ConfirmDialog
        open={nextMode !== null}
        title="モードを変更しますか？"
        description={`「${mode.name}」から「${modes.find((m) => m.id === nextMode)?.name ?? ""}」に変更します。登録済みのデータはそのまま使われます。`}
        confirmLabel="変更する"
        busy={busy}
        onConfirm={changeMode}
        onClose={() => setNextMode(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="取り組みを削除しますか？"
        description={`「${project.title}」を削除します。メンバー全員が閲覧できなくなります。`}
        confirmLabel="削除する"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
