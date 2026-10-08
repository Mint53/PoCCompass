"use client";

import { type ReactNode, useEffect } from "react";
import Button from "./Button";

/** Same API (subset) as TomasFront ConfirmDialog. Never use window.confirm. */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "実行する",
  cancelLabel = "キャンセル",
  tone = "default",
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="ダイアログを閉じる"
        className="absolute inset-0 bg-slate-900/45"
        onClick={() => !busy && onClose()}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{description}</div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "default"} onClick={() => void onConfirm()} disabled={busy}>
            {busy ? "処理中..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
