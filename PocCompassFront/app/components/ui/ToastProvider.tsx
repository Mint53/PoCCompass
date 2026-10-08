"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/** Same toast({title, message, tone}) API as TomasFront ToastProvider (without OS notifications). */
export type ToastTone = "success" | "error" | "info" | "warning";
type ToastInput = { title?: string; message: string; tone?: ToastTone; durationMs?: number };
type ToastRecord = ToastInput & { id: string; tone: ToastTone };

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

const toneStyles = {
  success: { wrapper: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2, iconClass: "text-emerald-600" },
  error: { wrapper: "border-rose-200 bg-rose-50 text-rose-900", icon: XCircle, iconClass: "text-rose-600" },
  info: { wrapper: "border-sky-200 bg-sky-50 text-sky-900", icon: Info, iconClass: "text-sky-600" },
  warning: { wrapper: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle, iconClass: "text-amber-600" },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef<Record<string, number>>({});

  const dismiss = useCallback((id: string) => {
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ tone = "info", durationMs = 6000, ...rest }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => [...prev, { id, tone, durationMs, ...rest }]);
      timers.current[id] = window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[110] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3" aria-live="polite">
        {toasts.map((t) => {
          const s = toneStyles[t.tone];
          const Icon = s.icon;
          return (
            <section key={t.id} className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl ${s.wrapper}`} role="status">
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.iconClass}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {t.title && <p className="text-sm font-semibold">{t.title}</p>}
                  <p className="whitespace-pre-line text-sm leading-5">{t.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="rounded-full p-1 text-slate-500 hover:bg-white/60"
                  aria-label="通知を閉じる"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
