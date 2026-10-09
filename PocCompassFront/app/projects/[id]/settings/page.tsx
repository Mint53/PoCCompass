"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage, type Mode } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import DepartmentShare from "../../../components/DepartmentShare";
import MemberPicker, { type PickerMember } from "../../../components/MemberPicker";
import { useToast } from "../../../components/ui/ToastProvider";
import { useApp } from "../../../contexts/AppContext";
import { useProject } from "../ProjectContext";

export default function SettingsPage() {
  const { modes, me } = useApp();
  const { project, mode, isOwner, reloadProject, bump } = useProject();
  const { toast } = useToast();
  const router = useRouter();
  const [list, setList] = useState<PickerMember[] | null>(null);
  const [saved, setSaved] = useState<PickerMember[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [savingMembers, setSavingMembers] = useState(false);
  const [nextMode, setNextMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const ownerDepartment = list?.find((m) => m.role === "owner")?.department ?? "";

  useEffect(() => {
    let alive = true;
    api
      .listMembers(project.id)
      .then((rows) => {
        if (!alive) return;
        setList(rows);
        setSaved(rows);
      })
      .catch((e) => alive && setMembersError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [project.id, project.members, project.viewers]);

  const signature = (rows: PickerMember[]) => rows.map((m) => `${m.email}:${m.role}`).sort().join("|");
  const dirty = useMemo(() => list !== null && signature(list) !== signature(saved), [list, saved]);

  const saveMembers = async () => {
    if (!list) return;
    setSavingMembers(true);
    try {
      await api.updateProject(project.id, {
        members: list.filter((m) => m.role !== "viewer").map((m) => m.email),
        viewers: list.filter((m) => m.role === "viewer").map((m) => m.email),
      });
      await reloadProject();
      toast({ tone: "success", message: "メンバーを保存しました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setSavingMembers(false);
    }
  };

  const changeShare = async (v: boolean) => {
    setSharing(true);
    try {
      await api.updateProject(project.id, { share_with_department: v });
      await reloadProject();
      toast({ tone: "success", message: v ? "同じ部署に公開しました（閲覧のみ）。" : "部署への公開をやめました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setSharing(false);
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
      <Card title="メンバー" actions={<Button size="sm" onClick={() => void saveMembers()} disabled={!isOwner || savingMembers || !dirty}>{savingMembers ? "保存中..." : "保存"}</Button>}>
        {membersError ? (
          <p className="text-sm text-rose-700" role="alert">{membersError}</p>
        ) : list === null ? (
          <p className="text-sm text-slate-500">読み込み中...</p>
        ) : (
          <MemberPicker members={list} onChange={setList} disabled={!isOwner || savingMembers} isAdmin={me.is_admin} />
        )}
        {ownerNote}
      </Card>

      <Card title="部署への公開">
        <DepartmentShare checked={project.shared_department !== ""} onChange={(v) => void changeShare(v)} department={project.shared_department || ownerDepartment} disabled={!isOwner || sharing} />
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
