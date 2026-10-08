"use client";

import { Bot, CheckCircle2, Loader2, MessageSquare, Send, Trash2, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type ChatMessage } from "@/lib/api/client";
import { cn, formatDateTime } from "@/lib/utils";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../components/ui/ToastProvider";
import { useProject } from "../ProjectContext";

const MAX = 4000;

const STATUS_LABEL: Record<string, { label: string; variant: "brand" | "green" | "yellow" | "slate" }> = {
  pending: { label: "未適用", variant: "brand" },
  applied: { label: "適用済み", variant: "green" },
  partially_applied: { label: "一部適用", variant: "yellow" },
  discarded: { label: "破棄", variant: "slate" },
};

function ProposalCard({ message, onChanged }: { message: ChatMessage; onChanged: (m: ChatMessage) => void }) {
  const { project, reloadItems, reloadProject } = useProject();
  const { toast } = useToast();
  const proposal = message.proposal!;
  const pending = proposal.status === "pending";
  const [checked, setChecked] = useState<boolean[]>(() => proposal.operations.map((o) => !o.error));
  const [busy, setBusy] = useState<"apply" | "discard" | null>(null);
  const status = STATUS_LABEL[proposal.status];

  const apply = async () => {
    const indexes = checked.flatMap((c, i) => (c ? [i] : []));
    if (!indexes.length) return;
    setBusy("apply");
    try {
      const updated = await api.applyChat(project.id, message.id, indexes);
      onChanged(updated);
      await Promise.all([reloadItems(), reloadProject()]);
      const failed = updated.proposal!.operations.filter((o) => o.result === "failed").length;
      toast({
        tone: failed ? "warning" : "success",
        message: failed ? `${failed} 件の操作が失敗しました。内容を確認してください。` : "提案を適用しました。",
      });
    } catch (e) {
      toast({ tone: "error", title: "適用できませんでした", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    setBusy("discard");
    try {
      onChanged(await api.discardChat(project.id, message.id));
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-indigo-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">変更の提案（{proposal.operations.length} 件）</p>
        {status && <Badge variant={status.variant}>{status.label}</Badge>}
      </div>
      <ul className="space-y-1.5">
        {proposal.operations.map((o, i) => (
          <li key={i} className={cn("flex items-start gap-2 text-sm", o.error && "opacity-70")}>
            {pending ? (
              <input
                type="checkbox"
                aria-label={o.summary}
                className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--primary))]"
                checked={checked[i]}
                disabled={!!o.error || busy !== null}
                onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
              />
            ) : o.result === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="適用済み" />
            ) : o.result === "failed" || o.error ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="失敗" />
            ) : (
              <span className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0">
              <span className="break-words text-slate-800">{o.summary}</span>
              {o.error && <span className="block text-xs text-rose-700">適用できません: {o.error}</span>}
              {o.result_message && <span className="block text-xs text-rose-700">{o.result_message}</span>}
            </span>
          </li>
        ))}
      </ul>
      {pending && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void discard()} disabled={busy !== null}>
            破棄
          </Button>
          <Button size="sm" onClick={() => void apply()} disabled={busy !== null || !checked.some(Boolean)}>
            {busy === "apply" ? "適用中..." : `選んだ ${checked.filter(Boolean).length} 件を適用`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, mode } = useProject();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lb = mode.labels;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setMessages(await api.listChat(project.id));
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [project.id]);

  useEffect(() => {
    if (open && messages === null) void load();
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, messages, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    if (!body || sending || body.length > MAX) return;
    setSending(true);
    setText("");
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      projectId: project.id,
      user_email: "",
      role: "user",
      content: body,
      created_at: new Date().toISOString(),
      proposal: null,
    };
    setMessages((prev) => [...(prev ?? []), optimistic]);
    try {
      const res = await api.sendChat(project.id, body);
      setMessages((prev) => [...(prev ?? []).filter((m) => m.id !== optimistic.id), res.user_message, res.assistant_message]);
    } catch (e) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
      setText(body);
      toast({ tone: "error", title: "送信できませんでした", message: errorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    try {
      await api.clearChat(project.id);
      setMessages([]);
      setConfirmClear(false);
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    }
  };

  const suggestions = [
    "今の状況を 3 行で教えて",
    `${lb.task}を追加したい`,
    `目的から外れている${lb.task}をどう整理すべき？`,
    `${lb.assumption}を見直したい`,
  ];

  return (
    <>
      <div
        className={cn("fixed inset-0 z-[60] bg-slate-900/30 transition-opacity md:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="AI チャット"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-[70] flex w-full flex-col border-l border-slate-200 bg-slate-50 shadow-2xl transition-transform duration-200 sm:w-[440px]",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
              <Bot className="h-4 w-4" aria-hidden="true" />
              AI チャット
            </p>
            <p className="truncate text-xs text-slate-500">{project.title}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="会話を消去" title="会話を消去" onClick={() => setConfirmClear(true)} disabled={!messages?.length || sending}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="閉じる" title="閉じる" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
          {loadError && <p className="text-sm text-rose-700" role="alert">{loadError}</p>}
          {messages === null && !loadError && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              読み込み中…
            </p>
          )}
          {messages?.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {lb.goal}・{lb.assumption}・{lb.criterion}・{lb.task}・{lb.evidence}について、話しかけるだけで質問や追加・修正ができます。
                変更は提案として表示され、<strong>「適用」を押すまで反映されません</strong>。
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
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
          {messages?.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[90%]", m.role === "user" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "border border-slate-200 bg-white text-slate-800",
                  )}
                >
                  {m.content}
                </div>
                {m.proposal && (
                  <ProposalCard message={m} onChanged={(u) => setMessages((prev) => (prev ?? []).map((x) => (x.id === u.id ? u : x)))} />
                )}
                <p className={cn("mt-1 text-[11px] text-slate-400", m.role === "user" && "text-right")}>{formatDateTime(m.created_at)}</p>
              </div>
            </div>
          ))}
          {sending && (
            <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              AI が考えています…
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t border-slate-200 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            メッセージ
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={2}
              value={text}
              maxLength={MAX}
              placeholder={`例: 「${mode.placeholders.task.replace(/^例: /, "")}」をタスクに追加して`}
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
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Enter で送信・Shift+Enter で改行</p>
        </form>
      </aside>

      <ConfirmDialog
        open={confirmClear}
        title="会話を消去しますか？"
        description="この取り組みでのあなたの会話履歴を削除します。適用済みの変更は元に戻りません。"
        confirmLabel="消去する"
        tone="danger"
        onConfirm={clear}
        onClose={() => setConfirmClear(false)}
      />
    </>
  );
}

const LAUNCHER_KEY = "poc-compass.chat-launcher-collapsed";

/**
 * Small floating entry to the AI chat. It stays out of the way: icon-only and faded until hovered,
 * and can be tucked into a thin edge tab (remembered per browser).
 */
export function ChatLauncher({ onOpen }: { onOpen: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(LAUNCHER_KEY) === "1");
    } catch {
      // storage unavailable: keep default
    }
  }, []);
  const setAndStore = (v: boolean) => {
    setCollapsed(v);
    try {
      window.localStorage.setItem(LAUNCHER_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setAndStore(false)}
        className="fixed bottom-24 right-0 z-40 flex h-12 w-5 items-center justify-center rounded-l-md bg-primary/70 text-primary-foreground hover:w-7 hover:bg-primary focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="AI に相談・編集のボタンを表示"
        title="AI に相談・編集を表示"
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className="group fixed bottom-4 right-4 z-40 flex items-center gap-1 opacity-70 transition-opacity focus-within:opacity-100 hover:opacity-100">
      <button
        type="button"
        onClick={() => setAndStore(true)}
        className="hidden h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring group-hover:flex group-focus-within:flex"
        aria-label="ボタンを端にしまう"
        title="端にしまう"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-11 items-center gap-2 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label="AI に相談・編集を開く"
        title="AI に相談・編集"
      >
        <MessageSquare className="h-5 w-5" aria-hidden="true" />
        <span className="hidden group-hover:inline group-focus-within:inline">AI に相談・編集</span>
      </button>
    </div>
  );
}
