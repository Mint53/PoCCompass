import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "outline" | "brand" | "red" | "green" | "yellow" | "orange" | "slate";

const styles: Record<BadgeVariant, string> = {
  outline: "border-slate-300 text-slate-700 bg-white",
  brand: "bg-accent border-indigo-200 text-accent-foreground",
  red: "bg-rose-50 border-rose-200 text-rose-700",
  green: "bg-emerald-50 border-emerald-200 text-emerald-700",
  yellow: "bg-amber-50 border-amber-200 text-amber-800",
  orange: "bg-orange-50 border-orange-200 text-orange-700",
  slate: "bg-slate-100 border-slate-200 text-slate-700",
};

export default function Badge({
  variant = "outline",
  className,
  children,
  title,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wide",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
