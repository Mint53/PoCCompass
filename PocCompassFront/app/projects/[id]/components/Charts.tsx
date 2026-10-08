"use client";

import { useId, useState } from "react";
import { useCountUp, useEntered } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Health gauge: the ring sweeps in and the number counts up. The score text is always shown, so colour is never the only signal. */
export function ScoreRing({ score, size = 132 }: { score: number | null; size?: number }) {
  const gid = useId();
  const entered = useEntered();
  const shown = useCountUp(score ?? 0, 1100);
  const stroke = 12;
  const r = (size - stroke - 4) / 2;
  const c = 2 * Math.PI * r;
  const value = entered ? (score ?? 0) : 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={score == null ? "健全度 未評価" : `健全度 ${score} / 100`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(129 140 248)" />
            <stop offset="100%" stopColor="rgb(79 70 229)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(226 232 240)" strokeWidth={stroke} />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(c * value) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.22,1,.36,1)", filter: "drop-shadow(0 2px 6px rgb(79 70 229 / 0.35))" }}
            className="motion-reduce:!transition-none"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold tabular-nums text-slate-900">{score == null ? "—" : shown}</span>
        <span className="text-xs text-slate-500">/100</span>
      </div>
    </div>
  );
}

/** Number that counts up from 0 when it appears. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value, 800);
  return <span className={className}>{v}</span>;
}

const TONE_BAR = {
  brand: "bg-gradient-to-r from-indigo-400 to-primary",
  slate: "bg-gradient-to-r from-slate-300 to-slate-400",
  rose: "bg-gradient-to-r from-rose-400 to-rose-500",
  amber: "bg-gradient-to-r from-amber-300 to-amber-500",
  emerald: "bg-gradient-to-r from-emerald-300 to-emerald-500",
} as const;

export type BarTone = keyof typeof TONE_BAR;

/** Tone for a 0-100 "higher is better" score (value is still printed next to the bar). */
export const toneForScore = (v: number | null): BarTone => (v == null ? "slate" : v >= 70 ? "emerald" : v >= 40 ? "amber" : "rose");

const TONE_NUM: Record<BarTone, string> = {
  brand: "text-slate-900",
  slate: "text-slate-800",
  rose: "text-rose-600",
  amber: "text-amber-600",
  emerald: "text-emerald-600",
};

/** "ズレ 42" -> ["ズレ", "42"]; anything else is shown as-is (e.g. "対象なし"). */
function splitValue(v: string): [string, string] {
  const m = /^(\D*?)\s*(\d+(?:\.\d+)?)$/.exec(v.trim());
  return m ? [m[1], m[2]] : ["", v];
}

/** Single-series horizontal bar row. The bar grows in (staggered by `index`); the number is large and tinted by tone. */
export function BarRow({
  label,
  value,
  max = 100,
  valueLabel,
  tone = "brand",
  tooltip,
  index = 0,
}: {
  label: string;
  value: number;
  max?: number;
  valueLabel: string;
  tone?: BarTone;
  tooltip?: string;
  index?: number;
}) {
  const [prefix, num] = splitValue(valueLabel);
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_4.75rem] items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-slate-50"
      title={tooltip ?? `${label}: ${valueLabel}`}
    >
      <span className="truncate text-sm text-slate-700">{label}</span>
      <GrowBar value={value} max={max} tone={tone} index={index} />
      <span className="flex items-baseline justify-end gap-1 whitespace-nowrap">
        {prefix && <span className="text-[11px] font-medium text-slate-500">{prefix}</span>}
        <span className={cn("text-lg font-extrabold leading-none tabular-nums", TONE_NUM[tone])}>{num}</span>
      </span>
    </div>
  );
}

/** The bar itself: grows from 0 when it appears. */
export function GrowBar({ value, max = 100, tone = "brand", index = 0, className }: { value: number; max?: number; tone?: BarTone; index?: number; className?: string }) {
  const entered = useEntered();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className={cn("block h-2.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <span
        className={cn("block h-full rounded-full shadow-sm transition-[width] duration-700 ease-out motion-reduce:transition-none", TONE_BAR[tone])}
        style={{ width: entered ? `${pct}%` : "0%", transitionDelay: `${index * 80}ms` }}
      />
    </span>
  );
}

/** Health score trend: the line draws itself, dots pop in, and hovering a dot shows its date and value. */
export function TrendLine({ points }: { points: { date: string; score: number | null }[] }) {
  const entered = useEntered();
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const data = points.filter((p) => p.score != null) as { date: string; score: number }[];
  if (data.length < 2) {
    return <p className="py-6 text-center text-sm text-slate-500">推移は 2 日分以上の評価がたまると表示されます。</p>;
  }
  const w = 560;
  const h = 140;
  const pad = { l: 28, r: 8, t: 12, b: 20 };
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / (data.length - 1);
  const y = (v: number) => pad.t + ((100 - v) * (h - pad.t - pad.b)) / 100;
  const path = data.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`).join(" ");
  const fmt = (d: string) => d.replaceAll("-", "/");
  const hp = hover == null ? null : data[hover];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="健全度の推移">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity={0.22} />
          <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(226 232 240)" strokeWidth={1} strokeDasharray={v === 0 ? undefined : "3 4"} />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgb(71 85 105)">
            {v}
          </text>
        </g>
      ))}
      <path d={`${path} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gid})`} style={{ opacity: entered ? 1 : 0, transition: "opacity 1s ease-out .5s" }} />
      <path
        d={path}
        pathLength={1}
        fill="none"
        stroke="rgb(var(--primary))"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={1}
        strokeDashoffset={entered ? 0 : 1}
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)" }}
        className="motion-reduce:!transition-none"
      />
      {data.map((p, i) => (
        <g key={p.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <circle
            cx={x(i)}
            cy={y(p.score)}
            r={hover === i ? 6 : 4}
            fill="rgb(var(--primary))"
            stroke="white"
            strokeWidth={2}
            style={{ opacity: entered ? 1 : 0, transition: `opacity .3s ease-out ${0.6 + i * 0.05}s, r .15s` }}
          />
          <circle cx={x(i)} cy={y(p.score)} r={12} fill="transparent">
            <title>{`${fmt(p.date)}: ${p.score}`}</title>
          </circle>
        </g>
      ))}
      {hp && hover != null && (
        <g pointerEvents="none">
          <rect x={Math.min(Math.max(x(hover) - 44, 0), w - 88)} y={Math.max(y(hp.score) - 34, 0)} width={88} height={24} rx={8} fill="rgb(15 23 42)" />
          <text x={Math.min(Math.max(x(hover), 44), w - 44)} y={Math.max(y(hp.score) - 18, 16)} textAnchor="middle" fontSize={11} fontWeight={700} fill="white">
            {fmt(hp.date).slice(5)}　{hp.score}
          </text>
        </g>
      )}
      <text x={pad.l} y={h - 4} fontSize={10} fill="rgb(100 116 139)">
        {fmt(data[0].date)}
      </text>
      <text x={w - pad.r} y={h - 4} fontSize={10} textAnchor="end" fill="rgb(100 116 139)">
        {fmt(data[data.length - 1].date)}
      </text>
    </svg>
  );
}
