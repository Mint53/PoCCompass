"use client";

import { Check, ChevronDown } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";
import Popover, { FIELD_CLASS } from "./Popover";

type Option = { value: string; label: string };
type Props = {
  options: Option[];
  value?: string;
  /** Same shape as a native <select> handler so existing call sites keep using `e.target.value`. */
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

/** Listbox-style dropdown (the native option list cannot be styled). Keyboard: ↑↓ Home End Enter Space Esc. */
export default function Select({ options, value, onChange, id, className, disabled, placeholder = "選択してください", ...rest }: Props) {
  const uid = React.useId();
  const listId = `${uid}-list`;
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const close = React.useCallback(() => setOpen(false), []);
  const openList = () => {
    if (disabled) return;
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    close();
    btnRef.current?.focus();
    if (o && o.value !== value) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, last));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Tab") close();
    else return;
    e.preventDefault();
  };

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${uid}-o${active}` : undefined}
        aria-label={rest["aria-label"]}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "group inline-flex h-10 w-full items-center justify-between gap-2 text-left font-medium",
          FIELD_CLASS,
          open && "border-primary ring-4 ring-primary/15",
          className,
        )}
      >
        <span className={cn("truncate", !selected && "font-normal text-slate-400")}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 group-hover:text-slate-600", open && "rotate-180 text-primary")} aria-hidden="true" />
      </button>
      <Popover open={open} anchorRef={btnRef} onClose={close} minWidth={120} className="max-h-72 overflow-y-auto">
        <ul id={listId} role="listbox" className="space-y-0.5">
          {options.map((o, i) => {
            const isSel = o.value === value;
            return (
              <li
                key={o.value}
                id={`${uid}-o${i}`}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-6 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors",
                  i === active && "bg-slate-100",
                  isSel ? "font-semibold text-primary" : "text-slate-700",
                )}
              >
                {o.label}
                {isSel && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}
