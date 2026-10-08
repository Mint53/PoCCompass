"use client";

import { cn } from "@/lib/utils";

/** One segment of a stacked bar. `swatch` is a Tailwind bg class; the count and label are always printed too. */
export type Segment = { key: string; label: string; value: number; swatch: string };

/** 100% stacked horizontal bar with a legend that repeats every number (color is never the only signal). */
export function StackedBar({ segments, emptyText }: { segments: Segment[]; emptyText: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join("、")}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.key} className={s.swatch} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value} 件`} />
          ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm text-slate-700">
            <span className={cn("h-3 w-3 shrink-0 rounded-sm", s.swatch)} aria-hidden="true" />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto tabular-nums text-slate-900">{s.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-slate-500">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Radar chart for 0-100 axes. A null value is drawn at the center and labelled 対象なし. */
export function Radar({ axes }: { axes: { label: string; value: number | null }[] }) {
  const w = 380;
  const h = 250;
  const cx = w / 2;
  const cy = h / 2;
  const r = 78;
  const n = axes.length;
  const pt = (i: number, ratio: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * ratio * Math.cos(a), cy + r * ratio * Math.sin(a)] as const;
  };
  const poly = (ratio: number) => axes.map((_, i) => pt(i, ratio).join(",")).join(" ");
  const data = axes.map((ax, i) => pt(i, Math.max(0, Math.min(100, ax.value ?? 0)) / 100).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full max-h-full w-full" role="img" aria-label={`健全度の構成: ${axes.map((a) => `${a.label} ${a.value == null ? "対象なし" : Math.round(a.value)}`).join("、")}`}>
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <polygon key={g} points={poly(g)} fill="none" stroke="rgb(226 232 240)" strokeWidth={1} />
      ))}
      {axes.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={pt(i, 1)[0]} y2={pt(i, 1)[1]} stroke="rgb(226 232 240)" strokeWidth={1} />
      ))}
      <polygon points={data} fill="rgb(var(--primary) / 0.18)" stroke="rgb(var(--primary))" strokeWidth={2} />
      {axes.map((ax, i) => {
        const [x, y] = pt(i, Math.max(0, Math.min(100, ax.value ?? 0)) / 100);
        const [px] = pt(i, 1);
        const side = Math.abs(px - cx) < 8 ? "middle" : px < cx ? "end" : "start";
        const [lx, ly] = pt(i, side === "middle" ? 1.36 : 1.16);
        return (
          <g key={ax.label}>
            <circle cx={x} cy={y} r={3.5} fill="rgb(var(--primary))" stroke="white" strokeWidth={1.5}>
              <title>{`${ax.label}: ${ax.value == null ? "対象なし" : Math.round(ax.value)}`}</title>
            </circle>
            <text x={lx} y={ly - 2} textAnchor={side} fontSize={12} fill="rgb(51 65 85)">
              {ax.label}
            </text>
            <text x={lx} y={ly + 12} textAnchor={side} fontSize={13} fontWeight={700} fill="rgb(15 23 42)">
              {ax.value == null ? "対象なし" : Math.round(ax.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
