"use client";

import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import * as React from "react";
import Button from "./Button";

/** The four states every screen needs (ui-design §4): loading / empty / error / normal. */

export function LoadingState({ title = "読み込み中です", description }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" role="status" aria-live="polite">
      <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-slate-400" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-center"
      role="alert"
    >
      <AlertTriangle className="h-7 w-7 text-rose-600" aria-hidden="true" />
      <p className="max-w-lg text-sm text-rose-900">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          再読み込み
        </Button>
      )}
    </div>
  );
}
