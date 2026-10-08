"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Shared look of every text-like field (Input / Textarea / Select / DateField triggers). */
export const FIELD_CLASS =
  "rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:bg-slate-100 disabled:text-slate-500";

const GAP = 6;
const MARGIN = 8;

/**
 * Floating panel anchored to an element, rendered in a portal so overflow-hidden parents and dialogs never clip it.
 * Opens below the anchor, flips above when there is no room, and closes on outside click / Escape / scroll / resize.
 */
export default function Popover({
  open,
  anchorRef,
  onClose,
  minWidth,
  matchWidth = true,
  className,
  children,
  id,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  minWidth?: number;
  /** Grow to at least the anchor's width (dropdowns). Off for fixed-size panels such as the calendar. */
  matchWidth?: boolean;
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number; above: boolean } | null>(null);

  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 0;
      if (!a) return;
      const width = Math.max(matchWidth ? a.width : 0, minWidth ?? 0);
      const left = Math.min(Math.max(MARGIN, a.left), window.innerWidth - width - MARGIN);
      const below = window.innerHeight - a.bottom - MARGIN;
      const above = a.top - MARGIN;
      const flip = h > below && above > below;
      setPos({ top: flip ? Math.max(MARGIN, a.top - h - GAP) : a.bottom + GAP, left, width, above: flip });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef, minWidth, matchWidth, children]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      id={id}
      style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, minWidth: pos?.width, visibility: pos ? "visible" : "hidden" }}
      className={cn(
        "z-[200] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_24px_48px_-16px_rgb(15_23_42/0.28)] animate-pop",
        pos?.above ? "origin-bottom" : "origin-top",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
