"use client";

import { Eye, Loader2, Pencil, Search, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type MemberRole, type UserRecord } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Popover, { FIELD_CLASS } from "./ui/Popover";
import Select from "./ui/Select";

export type PickerMember = { email: string; name: string; department: string; role: MemberRole };

export const ROLE_LABEL: Record<MemberRole, string> = { owner: "作成者", editor: "編集者", viewer: "閲覧者" };
const ROLE_HINT: Record<Exclude<MemberRole, "owner">, string> = {
  editor: "内容の追加・変更・AI 評価ができます",
  viewer: "見ることだけできます（変更はできません）",
};
const SEARCH_LIMIT = 20;
const DEBOUNCE_MS = 250;

/** Members are always picked from the user master (SPEC 14.2) — there is no free-text email entry. */
export default function MemberPicker({
  members,
  onChange,
  disabled,
  isAdmin,
}: {
  members: PickerMember[];
  onChange: (next: PickerMember[]) => void;
  disabled?: boolean;
  isAdmin?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<UserRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    const t = setTimeout(async () => {
      try {
        const rows = await api.searchUsers(q.trim(), SEARCH_LIMIT);
        if (!cancelled) setResults(rows);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    }, results === null ? 0 : DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `results` is intentionally not a dependency: it only decides whether the first fetch is debounced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  const close = useCallback(() => setOpen(false), []);
  const byEmail = new Map(members.map((m) => [m.email, m]));
  const counts = {
    editor: members.filter((m) => m.role === "owner" || m.role === "editor").length,
    viewer: members.filter((m) => m.role === "viewer").length,
  };

  const add = (u: UserRecord, role: "editor" | "viewer") => {
    if (byEmail.has(u.email)) return;
    onChange([...members, { email: u.email, name: u.name, department: u.department, role }]);
  };
  const setRole = (email: string, role: "editor" | "viewer") =>
    onChange(members.map((m) => (m.email === email ? { ...m, role } : m)));
  const remove = (email: string) => onChange(members.filter((m) => m.email !== email));

  return (
    <div className="space-y-4">
      {!disabled && (
        <div>
          <label htmlFor="member-search" className="mb-1.5 block text-[13px] font-semibold text-slate-700">
            ユーザーを検索して追加
          </label>
          <div ref={anchorRef} className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="member-search"
              type="search"
              role="combobox"
              aria-expanded={open}
              aria-controls="member-search-results"
              autoComplete="off"
              value={q}
              placeholder="氏名・部署・メールアドレスで検索"
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              className={cn(FIELD_CLASS, "h-10 w-full pl-10")}
            />
          </div>
          <Popover open={open} anchorRef={anchorRef} onClose={close} id="member-search-results" className="max-h-80 overflow-y-auto p-1">
            {error ? (
              <p className="px-3 py-3 text-sm text-rose-700" role="alert">{error}</p>
            ) : results === null ? (
              <p className="flex items-center gap-2 px-3 py-3 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                検索しています…
              </p>
            ) : results.length === 0 ? (
              <div className="space-y-1 px-3 py-3 text-sm text-slate-600">
                <p>該当するユーザーがいません。</p>
                <p className="text-xs text-slate-500">
                  ユーザーマスタに無い人は追加できません。
                  {isAdmin ? (
                    <>
                      <Link href="/admin/users" className="ml-1 font-semibold text-primary underline">ユーザー管理</Link>
                      から登録してください。
                    </>
                  ) : (
                    "管理者にユーザー登録を依頼してください。"
                  )}
                </p>
              </div>
            ) : (
              <ul role="listbox" aria-label="検索結果">
                {results.map((u) => {
                  const existing = byEmail.get(u.email);
                  return (
                    <li key={u.email} role="option" aria-selected={!!existing} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{u.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {u.department ? `${u.department}・` : ""}
                          {u.email}
                        </span>
                      </span>
                      {existing ? (
                        <Badge variant="slate">追加済み（{ROLE_LABEL[existing.role]}）</Badge>
                      ) : (
                        <span className="flex shrink-0 gap-1.5">
                          <Button size="sm" variant="outline" title={ROLE_HINT.editor} onClick={() => add(u, "editor")} aria-label={`${u.name} を編集者として追加`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            編集者
                          </Button>
                          <Button size="sm" variant="outline" title={ROLE_HINT.viewer} onClick={() => add(u, "viewer")} aria-label={`${u.name} を閲覧者として追加`}>
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            閲覧者
                          </Button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Popover>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-slate-700">
          現在のメンバー
          <span className="ml-2 text-xs font-normal text-slate-500">
            編集者 {counts.editor} 名・閲覧者 {counts.viewer} 名
          </span>
        </p>
        {members.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            まだメンバーがいません。上の検索欄から追加してください。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {members.map((m) => (
              <li key={m.email} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm font-semibold text-slate-900">{m.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {m.department ? `${m.department}・` : ""}
                    {m.email}
                  </span>
                </span>
                {m.role === "owner" ? (
                  <Badge variant="brand" title="作成者は常に編集者として含まれます">作成者</Badge>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <div className="w-32">
                      <Select
                        aria-label={`${m.name} の役割`}
                        value={m.role}
                        disabled={disabled}
                        options={[
                          { value: "editor", label: "編集者" },
                          { value: "viewer", label: "閲覧者" },
                        ]}
                        onChange={(e) => setRole(m.email, e.target.value as "editor" | "viewer")}
                      />
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`${m.name} をメンバーから外す`} title="メンバーから外す" disabled={disabled} onClick={() => remove(m.email)}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          編集者: {ROLE_HINT.editor}。閲覧者: {ROLE_HINT.viewer}。
        </p>
      </div>
    </div>
  );
}
