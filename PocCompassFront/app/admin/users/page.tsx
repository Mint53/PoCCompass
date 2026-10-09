"use client";

import { Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type UserRecord } from "@/lib/api/client";
import { USER_ROLE, labelOf } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Field from "../../components/ui/Field";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";
import { useApp } from "../../contexts/AppContext";

const LIST_LIMIT = 500;
const DEBOUNCE_MS = 250;
const EMAIL_RE = /^[^@\s]+@[^@\s]+$/;

type Role = UserRecord["role"];
type Form = { email: string; name: string; department: string; role: Role };
type Editing = { kind: "new" } | { kind: "edit"; user: UserRecord };

function UserDialog({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { me } = useApp();
  const isEdit = editing.kind === "edit";
  const lockReason = editing.kind !== "edit" ? null : editing.user.role_locked ? "環境設定（ADMIN_EMAILS）で管理者に固定されているため変更できません。" : editing.user.email === me.email ? "自分自身の役割は変更できません。他の管理者に依頼してください。" : null;
  const [form, setForm] = useState<Form>(
    editing.kind === "edit"
      ? { email: editing.user.email, name: editing.user.name, department: editing.user.department, role: editing.user.role }
      : { email: "", name: "", department: "", role: "general" },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: typeof errors = {};
    if (!isEdit && !EMAIL_RE.test(form.email.trim())) e.email = "メールアドレスの形式で入力してください（例: taro.yamada@example.com）。";
    if (!form.name.trim()) e.name = "氏名を入力してください。";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = { name: form.name.trim(), department: form.department.trim(), ...(lockReason ? {} : { role: form.role }) };
      if (editing.kind === "edit") await api.updateUser(editing.user.email, body);
      else await api.createUser({ email: form.email.trim(), ...body });
      toast({ tone: "success", message: isEdit ? "ユーザーを更新しました。" : "ユーザーを追加しました。" });
      onSaved();
    } catch (err) {
      toast({ tone: "error", title: isEdit ? "更新できませんでした" : "追加できませんでした", message: errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <Modal open title={isEdit ? "ユーザーを編集" : "ユーザーを追加"} onClose={busy ? () => undefined : onClose} className="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          void save();
        }}
      >
        <Field label="メールアドレス" htmlFor="u-email" required error={errors.email} hint={isEdit ? "メールアドレスは変更できません（変えたいときは削除して追加し直してください）。" : "サインインに使う会社のメールアドレス。"}>
          <Input id="u-email" type="email" value={form.email} disabled={isEdit || busy} autoFocus={!isEdit} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="氏名" htmlFor="u-name" required error={errors.name}>
          <Input id="u-name" value={form.name} maxLength={50} disabled={busy} autoFocus={isEdit} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="部署" htmlFor="u-dept" hint="任意。検索の絞り込みと、取り組みの「同じ部署に公開」の判定に使います（表記は完全に同じにしてください）。">
          <Input id="u-dept" value={form.department} maxLength={50} disabled={busy} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </Field>
        <Field label="役割" htmlFor="u-role" hint={lockReason ?? USER_ROLE.find((r) => r.value === form.role)?.hint}>
          <Select id="u-role" value={form.role} options={USER_ROLE.map((r) => ({ value: r.value, label: r.label }))} disabled={busy || lockReason !== null} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "保存中..." : isEdit ? "更新する" : "追加する"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersAdminPage() {
  const { me } = useApp();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<UserRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query: string) => {
    setError(null);
    try {
      const rows = await api.searchUsers(query.trim(), LIST_LIMIT);
      setUsers(rows);
      // Keep the unfiltered count for the "全 N 名" label.
      setTotal(query.trim() ? (await api.searchUsers("", LIST_LIMIT)).length : rows.length);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!me.is_admin) return;
    const t = setTimeout(() => void load(q), users === null ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `users` only decides whether the first load is debounced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, load, me.is_admin]);

  if (!me.is_admin) {
    return <EmptyState title="管理者のみ利用できます" description="ユーザーマスタの管理は管理者のみ行えます。" />;
  }

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteUser(deleting.email);
      toast({ tone: "success", message: `${deleting.name} さんをマスタから削除しました。` });
      setDeleting(null);
      await load(q);
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">ユーザー管理</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            取り組みのメンバーは、ここに登録したユーザーから検索して選びます。全体の役割（管理者／全体閲覧者／一般）と部署もここで決めます。サインインできるかどうかは変わりません。
          </p>
        </div>
        <Button onClick={() => setEditing({ kind: "new" })}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          ユーザーを追加
        </Button>
      </div>

      <Card
        title={
          <span>
            ユーザー一覧
            {users && (
              <span className="ml-2 text-xs font-normal text-slate-500">
                {q.trim() ? `${users.length} 件が一致` : `${users.length} 名`}
                {q.trim() && total != null ? `（全 ${total} 名）` : ""}
              </span>
            )}
          </span>
        }
        actions={
          <div className="relative w-72 max-w-full">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input type="search" aria-label="ユーザーを検索" placeholder="氏名・部署・メールアドレスで検索" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        {error ? (
          <ErrorState message={error} onRetry={() => void load(q)} />
        ) : users === null ? (
          <LoadingState />
        ) : users.length === 0 ? (
          q.trim() ? (
            <EmptyState title="該当するユーザーがいません" description="検索ワードを変えるか、「ユーザーを追加」から登録してください。" />
          ) : (
            <EmptyState
              title="ユーザーがまだ登録されていません"
              description="取り組みにメンバーを追加するには、先にここへユーザーを登録します。"
              action={
                <Button onClick={() => setEditing({ kind: "new" })}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  最初のユーザーを追加
                </Button>
              }
            />
          )
        ) : (
          <div className="thin-scroll -mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">ユーザーマスタ</caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th scope="col" className="py-2 pr-3">氏名</th>
                  <th scope="col" className="py-2 pr-3">メールアドレス</th>
                  <th scope="col" className="py-2 pr-3">部署</th>
                  <th scope="col" className="py-2 pr-3">役割</th>
                  <th scope="col" className="py-2 pr-3">更新日時</th>
                  <th scope="col" className="py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.email} className="transition-colors hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">
                      <span className="break-words">{u.name}</span>
                    </td>
                    <td className="break-all py-2.5 pr-3 text-slate-700">{u.email}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{u.department || <span className="text-slate-400">—</span>}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={u.role === "admin" ? "brand" : u.role === "global_viewer" ? "yellow" : "slate"} title={u.role_locked ? "ADMIN_EMAILS に登録された管理者（画面から変更不可）" : undefined}>
                        {labelOf(USER_ROLE, u.role)}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-slate-500">{formatDateTime(u.updated_at)}</td>
                    <td className="whitespace-nowrap py-2.5 text-right">
                      <Button variant="ghost" size="icon" aria-label={`${u.name} を編集`} title="編集" onClick={() => setEditing({ kind: "edit", user: u })}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`${u.name} を削除`} title="削除" onClick={() => setDeleting(u)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <UserDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load(q);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="ユーザーをマスタから削除しますか？"
        description={`${deleting?.name ?? ""}（${deleting?.email ?? ""}）を削除します。すでにメンバーになっている取り組みへのアクセスは変わりません。検索には出なくなります。`}
        confirmLabel="削除する"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
