"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; count?: number };

/** Pill-style switch (same look as the project tab bar). `role="tablist"` when it swaps a view, `group` when it filters. */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  kind = "group",
  size = "md",
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  kind?: "group" | "tabs";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role={kind === "tabs" ? "tablist" : "group"}
      aria-label={label}
      className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 ring-1 ring-slate-200/70", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={kind === "tabs" ? "tab" : undefined}
            aria-selected={kind === "tabs" ? active : undefined}
            aria-pressed={kind === "group" ? active : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
              size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs",
              active ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-accent text-accent-foreground" : "bg-white/70 text-slate-600")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
