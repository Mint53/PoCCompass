"use client";

import { ArrowLeft, CalendarClock, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import { PROJECT_STATUS } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { ErrorState, LoadingState } from "../../components/ui/States";
import ChatPanel, { ChatLauncher } from "./components/ChatPanel";
import { ProjectProvider, useProjectLoader } from "./ProjectContext";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { value, error, retry } = useProjectLoader(id);
  const [chatOpen, setChatOpen] = useState(false);

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          取り組み一覧へ
        </Link>
        <ErrorState message={error.message} onRetry={error.notFound ? undefined : retry} />
      </div>
    );
  }
  if (!value) return <LoadingState />;

  const { project, mode, evaluating, evaluate, items } = value;
  const lb = mode.labels;
  const base = `/projects/${project.id}`;
  const tabs = [
    { href: base, label: "ダッシュボード" },
    { href: `${base}/analysis`, label: "分析" },
    { href: `${base}/wbs`, label: "WBS" },
    { href: `${base}/design`, label: "設計" },
    { href: `${base}/tasks`, label: lb.task, count: items.tasks.length },
    { href: `${base}/evidence`, label: lb.evidence, count: items.evidence.length },
    { href: `${base}/report`, label: "判断レポート" },
    { href: `${base}/settings`, label: "設定" },
  ];
  const status = PROJECT_STATUS[project.status];
  // SPEC §12.3: these screens fit the viewport at 100% zoom; their content scrolls inside, not the page.
  const fit = pathname === `${base}/analysis` || pathname === `${base}/wbs`;

  return (
    <ProjectProvider value={value}>
      <div className={cn(fit ? "flex h-[calc(100dvh-6.5rem-1px)] flex-col gap-3" : "space-y-3")}>
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-primary">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                取り組み一覧
              </Link>
              <Badge variant="brand">{mode.name}</Badge>
              {status && <Badge variant={status.variant}>{status.label}</Badge>}
              <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(project.start_date)} 〜 {lb.deadline} {formatDate(project.deadline)}
              </span>
            </div>
            <h1 className="break-words text-xl font-bold text-slate-900">{project.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void evaluate()} disabled={evaluating} aria-busy={evaluating}>
              {evaluating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {evaluating ? "AI が評価中（数十秒かかります）" : "AI で評価"}
            </Button>
          </div>
        </div>

        <nav className="sticky top-14 z-30 -mx-1 flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-background/95 px-1 backdrop-blur" aria-label="取り組みのメニュー">
          {tabs.map((t) => {
            const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium",
                  active ? "border-primary font-bold text-primary" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                {t.label}
                {t.count != null && (
                  <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-accent text-accent-foreground" : "bg-slate-100 text-slate-600")}>
                    {t.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn("animate-fade-in-up", fit ? "min-h-0 flex-1" : "pb-1")}>{children}</div>
      </div>
      {!chatOpen && <ChatLauncher onOpen={() => setChatOpen(true)} />}
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </ProjectProvider>
  );
}
