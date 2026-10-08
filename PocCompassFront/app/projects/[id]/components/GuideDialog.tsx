"use client";

import { ChevronLeft, ChevronRight, MousePointer2, Sparkles } from "lucide-react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { cn } from "@/lib/utils";
import { CountUp, ScoreRing } from "./Charts";

type Labels = { goal: string; assumption: string; criterion: string; task: string; evidence: string };

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/** Frame shared by every animated scene. Scenes are remounted (key) on each step so their animation replays. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-60 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-slate-50 ring-1 ring-slate-200" aria-hidden="true">
      {children}
    </div>
  );
}

function Chip({ children, tone = "slate", style, className }: { children: ReactNode; tone?: "slate" | "brand" | "rose" | "emerald"; style?: CSSProperties; className?: string }) {
  const tones = {
    slate: "bg-white text-slate-700 ring-slate-200",
    brand: "bg-primary text-white ring-primary",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  return (
    <span style={style} className={cn("stagger inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm ring-1", tones[tone], className)}>
      {children}
    </span>
  );
}

/* ---- scenes ---- */

function SceneOverview({ l }: { l: Labels }) {
  const items = [
    { t: l.goal, tone: "brand" as const },
    { t: `${l.assumption}・${l.criterion}`, tone: "slate" as const },
    { t: l.task, tone: "slate" as const },
    { t: "AI が照合", tone: "emerald" as const },
  ];
  return (
    <Stage>
      <div className="flex items-center gap-1.5">
        {items.map((it, i) => (
          <div key={it.t} className="flex items-center gap-1.5">
            <Chip tone={it.tone} style={{ "--i": i * 2 } as CSSProperties}>
              {it.t}
            </Chip>
            {i < items.length - 1 && (
              <svg width="22" height="12" viewBox="0 0 22 12" className="stagger text-slate-400" style={{ "--i": i * 2 + 1 } as CSSProperties}>
                <path d="M1 6h18m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </Stage>
  );
}

function SceneDesign({ l }: { l: Labels }) {
  const rows = [
    { t: l.goal, w: "92%", tone: "brand" as const },
    { t: l.assumption, w: "78%", tone: "slate" as const },
    { t: l.criterion, w: "64%", tone: "slate" as const },
  ];
  return (
    <Stage>
      <div className="w-[78%] space-y-3">
        {rows.map((r, i) => (
          <div key={r.t} className="stagger" style={{ "--i": i * 3 } as CSSProperties}>
            <p className="mb-1 text-[11px] font-bold text-slate-500">{r.t}</p>
            <div className="h-8 overflow-hidden rounded-xl border border-slate-200 bg-white px-2.5 shadow-sm">
              <div className="guide-type mt-2.5 h-3 rounded bg-slate-200" style={{ width: r.w, animationDelay: `${i * 700 + 400}ms` }} />
            </div>
          </div>
        ))}
      </div>
    </Stage>
  );
}

function SceneTasks({ l }: { l: Labels }) {
  const cards = [`${l.task} 1`, `${l.task} 2`, `${l.task} 3`];
  return (
    <Stage>
      <div className="flex items-center gap-5">
        <div className="stagger flex h-24 w-20 flex-col gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white p-2 text-[10px] text-slate-400 shadow-sm" style={{ "--i": 0 } as CSSProperties}>
          <span className="font-bold">週報・議事録</span>
          <span className="h-1.5 rounded bg-slate-200" />
          <span className="h-1.5 w-4/5 rounded bg-slate-200" />
          <span className="h-1.5 w-3/5 rounded bg-slate-200" />
        </div>
        <svg width="26" height="12" viewBox="0 0 26 12" className="stagger text-slate-400" style={{ "--i": 2 } as CSSProperties}>
          <path d="M1 6h22m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="space-y-2">
          {cards.map((c, i) => (
            <div key={c} className="animate-pop flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200" style={{ animationDelay: `${600 + i * 350}ms`, animationFillMode: "both" }}>
              <span className="h-2 w-2 rounded-full bg-indigo-400" />
              {c}
            </div>
          ))}
        </div>
      </div>
    </Stage>
  );
}

function SceneEvaluate() {
  return (
    <Stage>
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
            <p className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-600">
              ズレ <CountUp value={2} className="text-base" /> 件
            </p>
            <p className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-600">
              期限リスク <CountUp value={1} className="text-base" /> 件
            </p>
          </div>
        </div>
      </div>
    </Stage>
  );
}

function SceneCompass({ l }: { l: Labels }) {
  const dots = [
    { x1: 70, y1: -40, c: "fill-indigo-400" },
    { x1: -60, y1: 50, c: "fill-indigo-400" },
    { x1: 30, y1: 78, c: "fill-indigo-400" },
    { x1: -92, y1: -52, c: "fill-rose-500", bad: true },
  ];
  return (
    <Stage>
      <svg viewBox="-150 -110 300 220" className="h-full w-full">
        {[40, 75, 105].map((r) => (
          <circle key={r} r={r} fill="none" className="stroke-slate-200" />
        ))}
        <circle r={22} className="fill-primary" />
        <text y={4} textAnchor="middle" className="fill-white text-[10px] font-bold">
          {l.goal}
        </text>
        {dots.map((d, i) => (
          <g key={i} className="guide-drift" style={{ "--x1": `${d.x1}px`, "--y1": `${d.y1}px`, animationDelay: `${i * 150}ms` } as CSSProperties}>
            {d.bad && <circle r={14} className="guide-ping fill-rose-500/20" />}
            <circle r={7} strokeWidth={2.5} className={cn("stroke-white", d.c)} />
          </g>
        ))}
      </svg>
      <span className="guide-reveal absolute right-3 top-3 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600" style={{ animationDelay: "1.6s" }}>
        遠いほど{l.goal}からズレている
      </span>
    </Stage>
  );
}

function SceneDecide() {
  return (
    <Stage>
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
      <span className="guide-reveal absolute right-4 top-4 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700" style={{ animationDelay: "1.9s" }}>
        ✓ 記録しました
      </span>
    </Stage>
  );
}

/* ---- dialog ---- */

export default function GuideDialog({ open, onClose, labels: l }: { open: boolean; onClose: () => void; labels: Labels }) {
  const [step, setStep] = useState(0);

  const steps: { title: string; tab: string; body: ReactNode; scene: ReactNode }[] = [
    {
      title: "PoC Compass でできること",
      tab: "全体像",
      body: (
        <p>
          {l.goal}・{l.assumption}・{l.criterion}を決め、毎日の{l.task}がそこからズレていないかを AI が照らします。ズレを早く見つけて、続けるか・直すか・やめるかを人が判断するためのツールです。
        </p>
      ),
      scene: <SceneOverview l={l} />,
    },
    {
      title: `1. 「設計」で${l.goal}を決める`,
      tab: "設計",
      body: (
        <p>
          まず「設計」タブで、{l.goal}・{l.assumption}・{l.criterion}を登録します。AI はこれを物差しに判定するので、ここが具体的なほど精度が上がります。変更すると、全ての{l.task}が次回の評価で見直されます。
        </p>
      ),
      scene: <SceneDesign l={l} />,
    },
    {
      title: `2. ${l.task}を登録する`,
      tab: l.task,
      body: (
        <p>
          「{l.task}」タブで 1 件ずつ追加できます。週報や議事録を貼り付けると、AI が{l.task}の候補を抜き出すので、選んで一括登録もできます。開始日と期日を入れると WBS に帯で出ます。
        </p>
      ),
      scene: <SceneTasks l={l} />,
    },
    {
      title: "3. 「AI で評価」を押す",
      tab: "評価",
      body: (
        <p>
          右上の「AI で評価」で、各{l.task}が{l.goal}にどれだけ近いかを AI が採点します。健全度やズレの件数は「ダッシュボード」に出ます。毎朝 6 時にも自動で更新され、変更のない{l.task}は再評価されません。
        </p>
      ),
      scene: <SceneEvaluate />,
    },
    {
      title: "4. 「羅針盤」でズレを見つける",
      tab: "羅針盤",
      body: (
        <p>
          中心が{l.goal}で、点が{l.task}です。<b>遠い点ほど{l.goal}からズレています</b>。赤い点が要確認で、下の時間軸を動かすと過去の状態に戻れます。「分析」では判定の内訳や推移、「WBS」では日程を見られます。
        </p>
      ),
      scene: <SceneCompass l={l} />,
    },
    {
      title: "5. 人が判断する",
      tab: "判断",
      body: (
        <p>
          赤い点を選ぶと AI の指摘と提案が出ます。「指摘のとおり」は記録だけ、「当たらない」は件数から除外します。<b>AI がデータを書き換えることはありません</b>。{l.evidence}がたまったら「判断レポート」で、続行・軌道修正・撤退を検討できます。
        </p>
      ),
      scene: <SceneDecide />,
    },
  ];

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const last = steps.length - 1;
  const go = useCallback((n: number) => setStep(Math.max(0, Math.min(last, n))), [last]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, go]);

  const s = steps[step];
  return (
    <Modal open={open} title="使い方ガイド" onClose={onClose} className="max-w-3xl">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div key={`scene-${step}`} className="md:order-2">
          {s.scene}
        </div>
        <div className="flex flex-col md:order-1">
          <p className="text-xs font-bold text-primary">
            {step + 1} / {steps.length}・{s.tab}
          </p>
          <h3 className="mt-1 text-xl font-extrabold leading-snug tracking-tight text-slate-900">{s.title}</h3>
          <div className="mt-3 text-sm leading-relaxed text-slate-700" aria-live="polite">
            {s.body}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="ステップ">
          {steps.map((x, i) => (
            <button
              key={x.tab + i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`${i + 1}. ${x.tab}`}
              onClick={() => go(i)}
              className={cn("h-2 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25", i === step ? "w-6 bg-primary" : "w-2 bg-slate-300 hover:bg-slate-400")}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => go(step - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            戻る
          </Button>
          {step < last ? (
            <Button variant="dark" onClick={() => go(step + 1)}>
              次へ
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="dark" onClick={onClose}>
              はじめる
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-right text-[11px] text-slate-500">キーボードの ← → でも切り替えられます</p>
    </Modal>
  );
}
