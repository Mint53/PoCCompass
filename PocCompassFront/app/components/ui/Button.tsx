"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger";
  size?: "default" | "sm" | "lg" | "icon";
};

/** Same API as TomasFront Button; colors come from tokens (globals.css). */
export default function Button({ className, variant = "default", size = "default", type = "button", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    default: "bg-primary text-primary-foreground hover:opacity-90",
    outline: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    ghost: "text-slate-700 hover:bg-slate-100",
    danger: "bg-destructive text-destructive-foreground hover:opacity-90",
  } as const;
  const sizes = {
    default: "h-10 px-4",
    sm: "h-9 px-3",
    lg: "h-12 px-6",
    icon: "h-10 w-10",
  } as const;
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
