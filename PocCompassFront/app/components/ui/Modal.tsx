"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Open modals, oldest first: Esc closes only the top one (a dialog opened from inside another must not close both). */
const stack: symbol[] = [];

/**
 * Large content dialog (for "expand this card"). Esc / backdrop click / ✕ close it, the page behind does not scroll,
 * and focus returns to whatever opened it. For yes/no questions use ConfirmDialog instead.
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
  className,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const me = useRef(Symbol("modal")).current;
  // Own effect keyed on `open` only: onClose is usually an inline lambda, and re-registering would move this modal to the top.
  useEffect(() => {
    if (!open) return;
    stack.push(me);
    return () => {
      stack.splice(stack.indexOf(me), 1);
    };
  }, [open, me]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack[stack.length - 1] === me) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <button type="button" aria-label="閉じる" tabIndex={-1} className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative flex max-h-full w-full max-w-4xl animate-pop flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_32px_64px_-24px_rgb(15_23_42/0.4)]",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
