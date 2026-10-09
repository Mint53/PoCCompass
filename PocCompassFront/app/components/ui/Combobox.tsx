"use client";

import { Check } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";
import Input from "./Input";
import Popover from "./Popover";

type Props = {
  /** Candidates (already used values). Free text is still allowed. */
  options: string[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  "aria-label"?: string;
  /** Called for keys the list did not consume (e.g. Enter while the list is closed). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

/** Free-text input with a styled suggestion list (the native datalist popup cannot be styled). Keyboard: ↑↓ Enter Esc. */
export default function Combobox({ options, value, onChange, onKeyDown, className, ...rest }: Props) {
  const uid = React.useId();
  const listId = `${uid}-list`;
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);

  const q = value.trim().toLowerCase();
  const shown = options.filter((o) => o.toLowerCase().includes(q) && o !== value.trim());
  const visible = open && shown.length > 0;
  const close = React.useCallback(() => setOpen(false), []);

  const choose = (v: string) => {
    onChange(v);
    close();
    setActive(-1);
  };

  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (visible) {
      if (e.key === "ArrowDown") {
        setActive((a) => (a + 1) % shown.length);
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp") {
        setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
        e.preventDefault();
        return;
      }
      if (e.key === "Enter" && active >= 0) {
        choose(shown[active]);
        e.preventDefault();
        return;
      }
    } else if (e.key === "ArrowDown") {
      setOpen(true);
      e.preventDefault();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div ref={wrapRef} className="w-full">
      <Input
        {...rest}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && active >= 0 ? `${uid}-o${active}` : undefined}
        autoComplete="off"
        className={className}
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={keyDown}
      />
      <Popover open={visible} anchorRef={wrapRef} onClose={close} minWidth={140} className="max-h-60 overflow-y-auto">
        <ul id={listId} role="listbox" className="space-y-0.5">
          {shown.map((o, i) => (
            <li
              key={o}
              id={`${uid}-o${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              className={cn("flex cursor-pointer items-center justify-between gap-6 whitespace-nowrap rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors", i === active && "bg-slate-100 font-semibold text-primary")}
            >
              {o}
              {i === active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}
