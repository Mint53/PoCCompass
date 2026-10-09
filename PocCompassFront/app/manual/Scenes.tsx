"use client";

import { MousePointer2, RotateCcw, Search, Sparkles } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CountUp, ScoreRing } from "../projects/[id]/components/Charts";

export type Labels = {
  goal: string;
  assumption: string;
  criterion: string;
  deadline: string;
  task: string;
  evidence: string;
  decision_continue: string;
  decision_pivot: string;
  decision_stop: string;
};

const d = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties;
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms`, animationFillMode: "both" });

/**
 * Frame for every animated scene. Starts playing when it scrolls into view and can be replayed (the scene is remounted).
 * The scene is decorative (aria-hidden); the surrounding text always says the same thing.
 */
export function Scene({ children, caption }: { children: ReactNode; caption?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <figure className="space-y-2">
      <div ref={ref} className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-slate-50 ring-1 ring-slate-200" aria-hidden="true">
        {visible && <div key={run} className="flex h-full w-full items-center justify-center">{children}</div>}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setRun((n) => n + 1)}
          title="もう一度再生"
          className="absolute bottom-2 right-2 inline-flex h-8 items-center gap-1 rounded-lg bg-white/90 px-2 text-[11px] font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-primary"
        >
          <RotateCcw className="h-3 w-3" />
          もう一度
        </button>
      </div>
      {caption && <figcaption className="text-center text-xs text-slate-500">{caption}</figcaption>}
    </figure>
  );
}

function Chip({ children, tone = "slate", i = 0 }: { children: ReactNode; tone?: "slate" | "brand" | "rose" | "emerald"; i?: number }) {
  const tones = {
    slate: "bg-white text-slate-700 ring-slate-200",
    brand: "bg-primary text-white ring-primary",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  return (
    <span style={d(i)} className={cn("stagger inline-flex items-center whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm ring-1", tones[tone])}>
      {children}
    </span>
  );
}

const Arrow = ({ i }: { i: number }) => (
  <svg width="22" height="12" viewBox="0 0 22 12" className="stagger shrink-0 text-slate-400" style={d(i)}>
    <path d="M1 6h18m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* 1. overall flow */
export function SceneFlow({ l }: { l: Labels }) {
  const steps = [
    { t: l.goal, tone: "brand" as const },
    { t: `${l.assumption}・${l.criterion}`, tone: "slate" as const },
    { t: l.task, tone: "slate" as const },
    { t: "AI が照合", tone: "emerald" as const },
    { t: "人が判断", tone: "rose" as const },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 px-3">
      {steps.map((s, i) => (
        <div key={s.t} className="flex items-center gap-1.5">
          <Chip tone={s.tone} i={i * 2}>{s.t}</Chip>
          {i < steps.length - 1 && <Arrow i={i * 2 + 1} />}
        </div>
      ))}
    </div>
  );
}

/* 2. typing the design */
export function SceneDesign({ l }: { l: Labels }) {
  const rows = [
    { t: l.goal, w: "92%" },
    { t: l.assumption, w: "78%" },
    { t: l.criterion, w: "64%" },
    { t: l.deadline, w: "30%" },
  ];
  return (
    <div className="w-[78%] space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.t} className="stagger" style={d(i * 3)}>
          <p className="mb-0.5 text-[11px] font-bold text-slate-500">{r.t}</p>
          <div className="h-7 overflow-hidden rounded-xl border border-slate-200 bg-white px-2.5 shadow-sm">
            <div className="guide-type mt-2 h-3 rounded bg-slate-200" style={{ width: r.w, animationDelay: `${i * 650 + 400}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* 3. tab strip: each tab lights up in turn */
export function SceneTabs({ l }: { l: Labels }) {
  const tabs = ["ダッシュボード", "羅針盤", "分析", "WBS", "設計", l.task, l.evidence, "判断レポート", "設定"];
  return (
    <div className="w-[92%] space-y-3">
      <div className="flex gap-1 overflow-hidden rounded-2xl bg-slate-100 p-1 ring-1 ring-slate-200">
        {tabs.map((t, i) => (
          <span key={t} className="manual-tab-hl whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[11px] font-bold" style={{ animationDelay: `${i * 0.66}s` }}>
            {t}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stagger h-14 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" style={d(i + 2)} />
        ))}
      </div>
    </div>
  );
}

/* 4. evaluate button -> score */
export function SceneEvaluate() {
  return (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <span className="guide-press inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-indigo-500 to-primary px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-500/30">
          <Sparkles className="h-3.5 w-3.5" />
          AI で評価
        </span>
        <MousePointer2 className="guide-cursor -mt-2 h-5 w-5 fill-slate-900 text-white" />
      </div>
      <div className="guide-reveal flex items-center gap-4" style={{ animationDelay: "1.1s" }}>
        <ScoreRing score={65} size={96} />
        <div className="space-y-1.5 text-xs font-bold">
          <p className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-600">ズレ <CountUp value={2} className="text-base" /> 件</p>
          <p className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-600">期限リスク <CountUp value={1} className="text-base" /> 件</p>
        </div>
      </div>
    </div>
  );
}

/* 5. compass */
export function SceneCompass({ l }: { l: Labels }) {
  const dots = [
    { x: 70, y: -40, c: "fill-indigo-400" },
    { x: -60, y: 50, c: "fill-indigo-400" },
    { x: 30, y: 78, c: "fill-indigo-400" },
    { x: -92, y: -52, c: "fill-rose-500", bad: true },
  ];
  return (
    <>
      <svg viewBox="-150 -110 300 220" className="h-full w-full">
        {[40, 75, 105].map((r) => (
          <circle key={r} r={r} fill="none" className="stroke-slate-200" />
        ))}
        <circle r={22} className="fill-primary" />
        <text y={4} textAnchor="middle" className="fill-white text-[10px] font-bold">{l.goal}</text>
        {dots.map((p, i) => (
          <g key={i} className="guide-drift" style={{ "--x1": `${p.x}px`, "--y1": `${p.y}px`, animationDelay: `${i * 150}ms` } as CSSProperties}>
            {p.bad && <circle r={14} className="guide-ping fill-rose-500/20" />}
            <circle r={7} strokeWidth={2.5} className={cn("stroke-white", p.c)} />
          </g>
        ))}
      </svg>
      <span className="guide-reveal absolute right-3 top-3 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600" style={delay(1600)}>
        遠いほど{l.goal}からズレている
      </span>
    </>
  );
}

/* 6. feedback buttons */
export function SceneDecide() {
  return (
    <>
      <div className="w-[72%] rounded-2xl bg-white p-3.5 shadow-md ring-1 ring-slate-200">
        <p className="text-[11px] font-bold text-rose-500">目的逸脱の疑い</p>
        <p className="mt-0.5 text-xs font-bold text-slate-800">多言語対応を実装する</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">AI の指摘と提案が出ます。</p>
        <div className="relative mt-3 flex gap-2">
          <span className="flex-1 rounded-lg bg-slate-900 py-1.5 text-center text-[11px] font-bold text-white">指摘のとおり</span>
          <span className="guide-pressed flex-1 rounded-lg border border-slate-300 py-1.5 text-center text-[11px] font-bold text-slate-700">当たらない</span>
          <MousePointer2 className="guide-cursor2 absolute -bottom-1 right-8 h-5 w-5 fill-slate-900 text-white" />
        </div>
      </div>
      <span className="guide-reveal absolute right-4 top-4 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700" style={delay(1900)}>
        ✓ 記録しました
      </span>
    </>
  );
}

/* 7. report: three options */
export function SceneReport({ l }: { l: Labels }) {
  const opts = [
    { t: l.decision_continue, c: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    { t: l.decision_pivot, c: "border-amber-200 bg-amber-50 text-amber-800" },
    { t: l.decision_stop, c: "border-rose-200 bg-rose-50 text-rose-800" },
  ];
  return (
    <div className="w-[88%] space-y-3">
      <div className="stagger rounded-xl bg-white p-2.5 text-[11px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200" style={d(0)}>
        要約・判断に効く事実
        <span className="mt-1.5 block h-1.5 w-4/5 rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {opts.map((o, i) => (
          <div key={o.t} className={cn("stagger rounded-xl border p-2 text-center text-xs font-bold", o.c)} style={d(i + 2)}>
            {o.t}
            <span className="mt-1.5 block h-1.5 rounded bg-current opacity-20" />
            <span className="mt-1 block h-1.5 w-2/3 rounded bg-current opacity-20" />
          </div>
        ))}
      </div>
      <p className="guide-reveal text-center text-[11px] font-bold text-slate-500" style={delay(1500)}>
        選ぶのは人です →「判断の記録」に残す
      </p>
    </div>
  );
}

/* 8. member search & add */
export function SceneMembers() {
  return (
    <div className="w-[82%] space-y-2">
      <div className="flex h-9 items-center gap-2 rounded-xl border border-primary bg-white px-3 shadow-sm ring-4 ring-primary/10">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <span className="guide-type overflow-hidden whitespace-nowrap text-xs font-semibold text-slate-700" style={{ width: "7ch", animationDuration: "0.8s" }}>山田 太郎</span>
        <span className="manual-caret h-4 w-px bg-slate-500" />
      </div>
      <div className="guide-reveal rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200" style={delay(900)}>
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <span className="min-w-0 flex-1">
            <b className="block text-xs text-slate-900">山田 太郎</b>
            <span className="block text-[10px] text-slate-500">開発部・taro.yamada@example.com</span>
          </span>
          <span className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700">編集者</span>
          <span className="guide-pressed rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700" style={{ animationDelay: "1.8s" }}>閲覧者</span>
        </div>
      </div>
      <div className="manual-pop-row flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2" style={delay(3300)}>
        <b className="flex-1 text-xs text-slate-900">山田 太郎</b>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">閲覧者</span>
      </div>
    </div>
  );
}

/* 9. chat: ask -> proposal -> apply */
export function SceneChat() {
  return (
    <div className="w-[80%] space-y-2">
      <div className="manual-slide-in ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white" style={delay(100)}>
        来週のヒアリングをタスクに追加して
      </div>
      <div className="manual-slide-in flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200" style={delay(900)}>
        <span className="manual-dot" /><span className="manual-dot" style={{ animationDelay: "0.2s" }} /><span className="manual-dot" style={{ animationDelay: "0.4s" }} />
      </div>
      <div className="guide-reveal rounded-2xl bg-white p-2.5 shadow-md ring-1 ring-indigo-200" style={delay(2000)}>
        <p className="text-[10px] font-bold text-primary">AI の提案（まだ反映されていません）</p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-800">＋ タスク「顧客ヒアリング」を追加</p>
        <div className="mt-2 flex gap-1.5">
          <span className="guide-pressed rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white" style={{ animationDelay: "3.2s" }}>適用する</span>
          <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-600">破棄</span>
        </div>
      </div>
    </div>
  );
}

/* 10. user master (admin) */
export function SceneUsers() {
  const rows = [
    { n: "佐藤 花子", m: "hanako.sato@example.com", dpt: "営業部" },
    { n: "鈴木 一郎", m: "ichiro.suzuki@example.com", dpt: "開発部" },
  ];
  return (
    <div className="w-[88%] space-y-2">
      <div className="flex items-center justify-between">
        <b className="text-xs text-slate-700">ユーザー管理</b>
        <span className="guide-press rounded-lg bg-primary px-2.5 py-1 text-[10px] font-bold text-white">＋ ユーザーを追加</span>
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white text-[11px] shadow-sm ring-1 ring-slate-200">
        {rows.map((r, i) => (
          <div key={r.m} className="stagger flex items-center gap-2 px-3 py-1.5" style={d(i)}>
            <b className="w-20 text-slate-900">{r.n}</b>
            <span className="flex-1 truncate text-slate-500">{r.m}</span>
            <span className="text-slate-500">{r.dpt}</span>
          </div>
        ))}
        <div className="manual-pop-row flex items-center gap-2 px-3 py-1.5" style={delay(1300)}>
          <b className="w-20 text-slate-900">山田 太郎</b>
          <span className="flex-1 truncate text-slate-500">taro.yamada@example.com</span>
          <span className="text-slate-500">開発部</span>
        </div>
      </div>
    </div>
  );
}
