"use client";

import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import React from "react";
import { cn, formatDate } from "@/lib/utils";
import Popover, { FIELD_CLASS } from "./Popover";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v?: string | null): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
};

/** Calendar date picker (the native one cannot be styled). Value is "YYYY-MM-DD" or "". */
export default function DateField({
  value,
  onChange,
  id,
  min,
  max,
  disabled,
  clearable,
  placeholder = "日付を選択",
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  clearable?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const selected = parse(value);
  const [focus, setFocus] = React.useState<Date>(() => selected ?? new Date());
  const minD = parse(min);
  const maxD = parse(max);
  const today = new Date();
  const todayIso = iso(today);

  const outOfRange = (d: Date) => (!!minD && iso(d) < iso(minD)) || (!!maxD && iso(d) > iso(maxD));
  const close = React.useCallback(() => setOpen(false), []);
  const openCal = () => {
    if (disabled) return;
    setFocus(selected ?? new Date());
    setOpen(true);
  };
  const pick = (d: Date) => {
    if (outOfRange(d)) return;
    onChange(iso(d));
    close();
    btnRef.current?.focus();
  };

  // keep the keyboard focus on the active day
  React.useEffect(() => {
    if (!open) return;
    // the popover is positioned in a layout effect; focus after it becomes visible
    const r = requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus());
    return () => cancelAnimationFrame(r);
  }, [open, focus]);

  const y = focus.getFullYear();
  const m = focus.getMonth();
  const first = new Date(y, m, 1);
  const start = addDays(first, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  const onGridKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -focus.getDay()),
      End: () => addDays(focus, 6 - focus.getDay()),
    };
    const next = moves[e.key];
    if (!next) return;
    e.preventDefault();
    setFocus(next());
  };

  const nav = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openCal())}
        className={cn("group inline-flex h-10 w-full items-center justify-between gap-2 text-left tabular-nums", FIELD_CLASS, clearable && selected && "pr-9", open && "border-primary ring-4 ring-primary/15")}
      >
        <span className={cn(!selected && "text-slate-400")}>{selected ? formatDate(value) : placeholder}</span>
        <CalendarDays className={cn("h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-600", open && "text-primary", clearable && selected && "mr-1")} aria-hidden="true" />
      </button>
      {clearable && selected && !disabled && (
        <button
          type="button"
          aria-label="日付をクリア"
          title="クリア"
          onClick={() => onChange("")}
          className="absolute right-9 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      <Popover open={open} anchorRef={btnRef} onClose={close} minWidth={288} matchWidth={false} className="w-72 p-3">
        <div role="dialog" aria-label="カレンダー">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex">
              <button type="button" className={nav} aria-label="前の年" onClick={() => setFocus(addMonths(focus, -12))}>
                <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={nav} aria-label="前の月" onClick={() => setFocus(addMonths(focus, -1))}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm font-bold tabular-nums text-slate-900" aria-live="polite">
              {y}年 {m + 1}月
            </p>
            <div className="flex">
              <button type="button" className={nav} aria-label="次の月" onClick={() => setFocus(addMonths(focus, 1))}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={nav} aria-label="次の年" onClick={() => setFocus(addMonths(focus, 12))}>
                <ChevronsRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold" aria-hidden="true">
            {WEEK.map((w, i) => (
              <span key={w} className={cn("py-1", i === 0 ? "text-rose-400" : i === 6 ? "text-sky-500" : "text-slate-400")}>
                {w}
              </span>
            ))}
          </div>
          <div ref={gridRef} role="grid" className="grid grid-cols-7 gap-y-0.5" onKeyDown={onGridKey}>
            {cells.map((d) => {
              const k = iso(d);
              const inMonth = d.getMonth() === m;
              const isSel = !!selected && k === iso(selected);
              const isToday = k === todayIso;
              const off = outOfRange(d);
              const isFocus = k === iso(focus);
              return (
                <button
                  key={k}
                  type="button"
                  role="gridcell"
                  tabIndex={isFocus ? 0 : -1}
                  disabled={off}
                  aria-selected={isSel}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`}
                  onClick={() => pick(d)}
                  className={cn(
                    "mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-sm tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    isSel
                      ? "bg-slate-900 font-bold text-white shadow-sm"
                      : cn(
                          "hover:bg-slate-100",
                          inMonth ? (d.getDay() === 0 ? "text-rose-500" : d.getDay() === 6 ? "text-sky-600" : "text-slate-800") : "text-slate-300",
                          isToday && "font-bold text-primary ring-1 ring-inset ring-primary/40",
                        ),
                    off && "cursor-not-allowed text-slate-300 line-through hover:bg-transparent",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              disabled={outOfRange(today)}
              onClick={() => pick(today)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-primary transition hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40"
            >
              今日
            </button>
            {clearable && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  close();
                  btnRef.current?.focus();
                }}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                クリア
              </button>
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}
