"use client";

import { CheckCircle2, Inbox, Loader2, MonitorSmartphone, Package, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  errorMessage,
  type Request,
  type Screen,
  type ScreenDetail,
  type ScreenMessage,
} from "@/lib/api/client";
import { REQUEST_KIND, labelOf } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Field from "../../../components/ui/Field";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Segmented from "../../../components/ui/Segmented";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui/States";
import Textarea from "../../../components/ui/Textarea";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";
import HandoffDialog from "./HandoffDialog";
import MockPreview from "./MockPreview";

const MAX = 4000;
const SUGGESTIONS = [
  "一覧画面を作って。上に検索条件、下に結果の表",
  "スマホで使う前提の入力画面にして",
  "エラーになったときの表示も見せて",
];

function ScreenForm({ open, screen, onClose, onSaved }: { open: boolean; screen: Screen | null; onClose: () => void; onSaved: (s: Screen) => void }) {
  const { project } = useProject();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(screen?.name ?? "");
    setDescription(screen?.description ?? "");
    setBusy(false);
  }, [open, screen]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim() };
      const s = screen ? await api.updateScreen(project.id, screen.id, body) : await api.createScreen(project.id, body);
      onSaved(s);
      onClose();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <Modal open={open} title={screen ? "画面の名前と説明" : "画面を追加"} onClose={onClose} className="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="画面の名前" htmlFor="screen-name" required>
          <Input id="screen-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="例: 申請一覧（承認者）" autoFocus />
        </Field>
        <Field label="説明" htmlFor="screen-desc" hint="誰が・何のために使う画面か。AI がモックを作るときの手がかりになります。">
          <Textarea id="screen-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {screen ? "保存" : "追加"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Turns a hearing remark into a request / issue (SPEC §18.6 → §16.1). */
function ToRequestDialog({ message, screen, versionNo, onClose }: { message: ScreenMessage | null; screen: Screen; versionNo: number | null; onClose: () => void }) {
  const { project, reloadItems } = useProject();
  const { toast } = useToast();
  const [kind, setKind] = useState<Request["kind"]>("request");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!message) return;
    setKind("request");
    setTitle(message.content.split("\n")[0].slice(0, 100));
    setBusy(false);
  }, [message]);
  if (!message) return null;
  const save = async () => {
    setBusy(true);
    try {
      const from = `画面モック「${screen.name}」${versionNo ? `（v${versionNo}）` : ""}のヒアリングより`;
      await api.createItem(project.id, {
        type: "request",
        kind,
        title: title.trim(),
        description: `${from}\n\n${message.content}`,
        requester: message.author_name,
        priority: "medium",
      });
      await reloadItems();
      toast({ tone: "success", message: `${labelOf(REQUEST_KIND, kind)}に登録しました。「要望・課題」タブで対応の要否を判断できます。` });
      onClose();
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <Modal open title="要望・課題に登録" onClose={onClose} className="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Segmented
          label="種別"
          options={[
            { value: "request", label: "要望" },
            { value: "issue", label: "課題" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Field label="件名" htmlFor="req-title" required>
          <Input id="req-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200/70">{message.content}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            登録
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function MocksPage() {
  const { project, canEdit } = useProject();
  const { toast } = useToast();
  const [screens, setScreens] = useState<Screen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScreenDetail | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [html, setHtml] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState<{ screen: Screen | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [toRequest, setToRequest] = useState<ScreenMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadScreens = useCallback(async () => {
    setError(null);
    try {
      const list = await api.listScreens(project.id);
      setScreens(list);
      setSelectedId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [project.id]);

  useEffect(() => {
    void loadScreens();
  }, [loadScreens]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    api
      .getScreen(project.id, selectedId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        const last = d.versions[d.versions.length - 1];
        setVersionId(d.screen.adopted_version_id ?? last?.id ?? null);
      })
      .catch((e) => !cancelled && toast({ tone: "error", message: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
  }, [project.id, selectedId, toast]);

  useEffect(() => {
    if (!detail || !versionId || html[versionId] !== undefined) return;
    api
      .getScreenVersion(project.id, detail.screen.id, versionId)
      .then((v) => setHtml((h) => ({ ...h, [v.id]: v.html })))
      .catch((e) => toast({ tone: "error", message: errorMessage(e) }));
  }, [project.id, detail, versionId, html, toast]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length, sending]);

  const screen = detail?.screen ?? null;
  const versions = detail?.versions ?? [];
  const version = versions.find((v) => v.id === versionId) ?? null;
  const noOf = (id: string | null | undefined) => versions.find((v) => v.id === id)?.no ?? null;

  const replaceScreen = (s: Screen) => {
    setScreens((list) => (list ?? []).map((x) => (x.id === s.id ? s : x)));
    setDetail((d) => (d && d.screen.id === s.id ? { ...d, screen: s } : d));
  };

  const send = async (message = text) => {
    if (!screen || !message.trim() || sending) return;
    setSending(true);
    try {
      // Edits build on the version on screen, so "go back to v2 and change X" works by just selecting v2.
      const r = await api.sendScreenMessage(project.id, screen.id, message.trim(), versionId);
      setText("");
      setDetail((d) =>
        d && d.screen.id === screen.id
          ? {
              ...d,
              screen: r.version ? { ...d.screen, latest_version_no: r.version.no } : d.screen,
              versions: r.version ? [...d.versions, r.version] : d.versions,
              messages: [...d.messages, r.user_message, r.assistant_message],
            }
          : d,
      );
      if (r.version) {
        const no = r.version.no;
        setScreens((list) => (list ?? []).map((x) => (x.id === screen.id ? { ...x, latest_version_no: no } : x)));
        setVersionId(r.version.id);
      }
    } catch (e) {
      toast({ tone: "error", title: "モックの作成に失敗しました", message: errorMessage(e) });
      // the request itself was recorded before the AI call
      const d = await api.getScreen(project.id, screen.id).catch(() => null);
      if (d) setDetail(d);
    } finally {
      setSending(false);
    }
  };

  const adopt = async (id: string | null) => {
    if (!screen) return;
    try {
      replaceScreen(await api.updateScreen(project.id, screen.id, { adopted_version_id: id ?? "" }));
      toast({ tone: "success", message: id ? `v${noOf(id)} を採用しました。引き渡しパックはこの版で作ります。` : "採用を外しました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    }
  };

  const remove = async () => {
    if (!screen) return;
    try {
      await api.deleteScreen(project.id, screen.id);
      setConfirmDelete(false);
      setSelectedId(null);
      await loadScreens();
      toast({ tone: "success", message: "画面を削除しました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void loadScreens()} />;
  if (!screens) return <LoadingState />;

  return (
    // Below lg the three panes stack: give each a fixed height and scroll this area (pb-16 clears the floating launcher;
    // `relative` keeps the sr-only labels, which are position:absolute, inside the scroller instead of stretching the page).
    <div className="thin-scroll relative grid h-full min-h-0 auto-rows-max gap-3 overflow-y-auto pb-16 lg:auto-rows-auto lg:grid-cols-[13rem_minmax(0,1fr)_22rem] lg:overflow-visible lg:pb-0">
      {/* screens */}
      <section className="flex max-h-56 min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-3 card-shadow lg:max-h-none" aria-label="画面の一覧">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold tracking-tight text-slate-900">画面</h2>
          <span className="text-xs tabular-nums text-slate-500">{screens.length} 件</span>
        </div>
        <ul className="thin-scroll -mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
          {screens.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                aria-current={s.id === selectedId ? "true" : undefined}
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                  s.id === selectedId ? "bg-accent font-semibold text-accent-foreground" : "text-slate-700 hover:bg-slate-50",
                )}
              >
                <span className="line-clamp-2 break-words">{s.name}</span>
                <span className="mt-0.5 flex flex-wrap gap-1 text-[11px] font-normal text-slate-500">
                  {s.latest_version_no > 0 ? `v${s.latest_version_no} まで` : "版なし"}
                  {s.handoff && <span className="text-emerald-700">・パック保存済み</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {canEdit && (
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setForm({ screen: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            画面を追加
          </Button>
        )}
      </section>

      {!screen ? (
        <div className="flex min-h-[20rem] items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-6 card-shadow lg:col-span-2 lg:min-h-0">
          {selectedId ? (
            <LoadingState />
          ) : (
            <EmptyState
              title="画面モックはまだありません"
              description={
                canEdit
                  ? "「画面を追加」で作りたい画面の名前を登録し、右の欄で依頼すると AI がモックを作ります。関係者に見せながら直していけます。"
                  : "編集者が画面を追加すると、ここでモックとヒアリングの記録を見られます。"
              }
              action={
                canEdit ? (
                  <Button onClick={() => setForm({ screen: null })}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    画面を追加
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      ) : (
        <>
          {/* preview */}
          <section className="flex h-[36rem] min-w-0 flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 card-shadow lg:h-auto lg:min-h-0" aria-label="プレビュー">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900">
                  <span className="truncate">{screen.name}</span>
                  {canEdit && (
                    <button type="button" onClick={() => setForm({ screen })} aria-label="名前と説明を編集" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </h2>
                {screen.description && <p className="line-clamp-1 text-xs text-slate-500">{screen.description}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {versions.length > 0 && (
                  <>
                    <label htmlFor="version-select" className="sr-only">
                      表示する版
                    </label>
                    <select
                      id="version-select"
                      value={versionId ?? ""}
                      onChange={(e) => setVersionId(e.target.value)}
                      className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {[...versions].reverse().map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.no}
                          {v.id === screen.adopted_version_id ? "（採用）" : ""}
                          {v.summary ? ` ${v.summary}` : ""}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {canEdit && version && (
                  screen.adopted_version_id === version.id ? (
                    <Button variant="outline" size="sm" onClick={() => void adopt(null)} title="採用を外す">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      採用中
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void adopt(version.id)}>
                      この版を採用
                    </Button>
                  )
                )}
                <Button size="sm" onClick={() => setHandoffOpen(true)} disabled={versions.length === 0 || (!canEdit && !screen.handoff)}>
                  <Package className="h-4 w-4" aria-hidden="true" />
                  引き渡しパック
                </Button>
                {canEdit && (
                  <Button variant="ghost" size="icon" aria-label="画面を削除" title="画面を削除" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {!version ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-center text-sm text-slate-500">
                  <MonitorSmartphone className="h-8 w-8 text-slate-300" aria-hidden="true" />
                  {canEdit ? "右の欄で、どんな画面にしたいかを伝えてください。" : "まだモックの版がありません。"}
                </div>
              ) : html[version.id] === undefined ? (
                <LoadingState />
              ) : (
                <MockPreview html={html[version.id]} title={`${screen.name} v${version.no}`} />
              )}
            </div>
          </section>

          {/* hearing thread */}
          {/* lg:mb-14 keeps the input clear of the floating "AI に相談" launcher (fixed bottom-right). */}
          <section className="flex h-[32rem] flex-col rounded-2xl border border-slate-200/80 bg-white card-shadow lg:mb-14 lg:h-auto lg:min-h-0" aria-label="ヒアリング">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-[15px] font-bold tracking-tight text-slate-900">ヒアリング</h2>
              <p className="text-xs text-slate-500">会話はこの取り組みのメンバー全員で共有されます。</p>
            </div>
            <div className="thin-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
              {detail!.messages.length === 0 && canEdit && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">聞き取った内容をそのまま書くと、AI がモックを作り・直します。版は毎回追加され、前の版も残ります。</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-left text-xs text-slate-700 hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {detail!.messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className="max-w-[92%]">
                    <div
                      className={cn(
                        "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6",
                        m.role === "user" ? "bg-primary text-primary-foreground" : "border border-slate-200 bg-white text-slate-800",
                      )}
                    >
                      {m.content}
                    </div>
                    <div className={cn("mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400", m.role === "user" && "justify-end")}>
                      {m.version_id && (
                        <button type="button" onClick={() => setVersionId(m.version_id!)} className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Badge variant={m.version_id === versionId ? "brand" : "slate"}>
                            v{noOf(m.version_id)} を表示{m.version_id === screen.adopted_version_id ? "（採用）" : ""}
                          </Badge>
                        </button>
                      )}
                      {m.role === "user" && <span>{m.author_name}</span>}
                      <span>{formatDateTime(m.created_at)}</span>
                      {m.role === "user" && canEdit && (
                        <button type="button" onClick={() => setToRequest(m)} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                          <Inbox className="h-3 w-3" aria-hidden="true" />
                          要望・課題に登録
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  AI が画面を作っています（数十秒かかります）…
                </p>
              )}
              <div ref={bottomRef} />
            </div>
            {canEdit && (
              <form
                className="border-t border-slate-200 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label htmlFor="mock-input" className="sr-only">
                  依頼
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    id="mock-input"
                    rows={2}
                    value={text}
                    maxLength={MAX}
                    placeholder="例: 承認日の列を足して、未承認は赤で目立たせて"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    disabled={sending}
                    className="max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-slate-100"
                  />
                  <Button type="submit" size="icon" aria-label="送信" title="送信（Enter）" disabled={sending || !text.trim()}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {version ? `表示中の v${version.no} を元に直します` : "新しく作ります"}・Enter で送信・Shift+Enter で改行
                </p>
              </form>
            )}
          </section>

          <HandoffDialog
            open={handoffOpen}
            screen={screen}
            versions={versions}
            defaultVersionId={screen.adopted_version_id ?? null}
            onClose={() => setHandoffOpen(false)}
            onSaved={replaceScreen}
          />
          <ToRequestDialog message={toRequest} screen={screen} versionNo={noOf(versionId)} onClose={() => setToRequest(null)} />
          <ConfirmDialog
            open={confirmDelete}
            title="画面を削除しますか？"
            description={`「${screen.name}」と、そのすべての版・ヒアリングの記録・引き渡しパックを削除します。元に戻せません。`}
            confirmLabel="削除する"
            tone="danger"
            onConfirm={remove}
            onClose={() => setConfirmDelete(false)}
          />
        </>
      )}

      <ScreenForm
        open={form !== null}
        screen={form?.screen ?? null}
        onClose={() => setForm(null)}
        onSaved={(s) => {
          if (form?.screen) replaceScreen(s);
          else {
            setScreens((list) => [...(list ?? []), s]);
            setSelectedId(s.id);
          }
        }}
      />
    </div>
  );
}
