"use client";

import { cn } from "@/lib/utils";

/** Health gauge (hero number + ring). Score text is always shown, so color is never the only signal. */
export function ScoreRing({ score, size = 132 }: { score: number | null; size?: number }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={score == null ? "健全度 未評価" : `健全度 ${score} / 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(226 232 240)" strokeWidth={12} />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgb(var(--primary))"
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={`${(c * value) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums text-slate-900">{score ?? "—"}</span>
        <span className="text-xs text-slate-500">/100</span>
      </div>
    </div>
  );
}

const TONE_BAR = { brand: "bg-primary", slate: "bg-slate-400", rose: "bg-rose-500", amber: "bg-amber-500" } as const;

/** Single-series horizontal bar row. Value is printed next to the bar; full text in the tooltip. */
export function BarRow({
  label,
  value,
  max = 100,
  valueLabel,
  tone = "brand",
  tooltip,
}: {
  label: string;
  value: number;
  max?: number;
  valueLabel: string;
  tone?: "brand" | "slate" | "rose" | "amber";
  tooltip?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_3.5rem] items-center gap-3 py-1" title={tooltip ?? `${label}: ${valueLabel}`}>
      <span className="truncate text-sm text-slate-700">{label}</span>
      <div className="h-2.5 w-full rounded-full bg-slate-100">
        <div
          className={cn("h-2.5 rounded-full transition-[width] group-hover:opacity-80", TONE_BAR[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-right text-sm tabular-nums text-slate-700">{valueLabel}</span>
    </div>
  );
}

/** Health score trend (single series). Each point has a native tooltip with date and value. */
export function TrendLine({ points }: { points: { date: string; score: number | null }[] }) {
  const data = points.filter((p) => p.score != null) as { date: string; score: number }[];
  if (data.length < 2) {
    return <p className="py-6 text-center text-sm text-slate-500">推移は 2 日分以上の評価がたまると表示されます。</p>;
  }
  const w = 560;
  const h = 140;
  const pad = { l: 28, r: 8, t: 8, b: 20 };
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / (data.length - 1);
  const y = (v: number) => pad.t + ((100 - v) * (h - pad.t - pad.b)) / 100;
  const path = data.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="健全度の推移">
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(226 232 240)" strokeWidth={1} />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgb(71 85 105)">
            {v}
          </text>
        </g>
      ))}
      <path d={`${path} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="rgb(var(--primary))" fillOpacity={0.08} />
      <path d={path} fill="none" stroke="rgb(var(--primary))" strokeWidth={2} />
      {data.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.score)} r={4} fill="rgb(var(--primary))" stroke="white" strokeWidth={2} />
          <circle cx={x(i)} cy={y(p.score)} r={12} fill="transparent">
            <title>{`${p.date.replaceAll("-", "/")}: ${p.score}`}</title>
          </circle>
        </g>
      ))}
      <text x={pad.l} y={h - 4} fontSize={10} fill="rgb(100 116 139)">
        {data[0].date.replaceAll("-", "/")}
      </text>
      <text x={w - pad.r} y={h - 4} fontSize={10} textAnchor="end" fill="rgb(100 116 139)">
        {data[data.length - 1].date.replaceAll("-", "/")}
      </text>
    </svg>
  );
}
