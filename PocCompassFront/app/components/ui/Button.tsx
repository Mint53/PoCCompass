"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "dark" | "outline" | "ghost" | "danger";
  size?: "default" | "sm" | "lg" | "icon";
};

/** Same API as TomasFront Button; colors come from tokens (globals.css). */
export default function Button({ className, variant = "default", size = "default", type = "button", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none motion-reduce:transition-none";
  const variants = {
    default: "bg-gradient-to-b from-indigo-500 to-primary text-primary-foreground shadow-sm shadow-indigo-500/30 hover:shadow-md hover:shadow-indigo-500/40 hover:brightness-110",
    dark: "bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:shadow-md",
    outline: "border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:shadow",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    danger: "bg-gradient-to-b from-rose-500 to-destructive text-destructive-foreground shadow-sm shadow-rose-500/30 hover:shadow-md hover:brightness-110",
  } as const;
  const sizes = {
    default: "h-10 px-4",
    sm: "h-9 px-3",
    lg: "h-12 px-6",
    icon: "h-10 w-10",
  } as const;
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
