"use client";

import { Compass, LayoutGrid, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "../contexts/AppContext";
import { cn } from "@/lib/utils";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me } = useApp();
  const pathname = usePathname();
  const nav = [
    { href: "/", label: "取り組み一覧", icon: LayoutGrid, active: pathname === "/" || pathname.startsWith("/projects") },
    ...(me.is_admin
      ? [{ href: "/admin/modes", label: "モード設定", icon: Settings2, active: pathname.startsWith("/admin") }]
      : []),
  ];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="container-like flex h-14 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-primary">
            <Compass className="h-6 w-6" aria-hidden="true" />
            <span className="text-lg tracking-tight">PoC Compass</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="メインメニュー">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition-colors",
                  n.active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <n.icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{n.label}</span>
              </Link>
            ))}
            <span className="ml-2 hidden max-w-[16rem] truncate text-sm text-slate-600 md:inline" title={me.email}>
              {me.name}
            </span>
          </nav>
        </div>
      </header>
      <main className="container-like py-4">{children}</main>
    </div>
  );
}
