"use client";

import type { Compass, CompassTask } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const R_CORE = 48;
const R_IN = 62;
const R_OUT = 230;
const R_PENDING = 205;
const SPREAD_DEG = 34;
const PROBLEM = new Set(["drift", "unnecessary_candidate"]);

export type DotState = "bad" | "ok" | "none";

/** SPEC §13.2: higher alignment = closer to the center. */
export const radiusOf = (score: number) => R_IN + (1 - score / 100) * (R_OUT - R_IN);

/** State of one task at frame `t`. The current frame uses the server's `needs_attention` (dismissals applied). */
export function stateAt(task: CompassTask, t: number, current: number): DotState {
  const pt = task.points[t];
  if (!pt) return "none";
  if (t === current) return task.needs_attention ? "bad" : "ok";
  return PROBLEM.has(pt.verdict) ? "bad" : "ok";
}

type Sector = { key: string | null; name: string; center: number; span: number };

function buildSectors(compass: Compass, assumptionLabel: string): Sector[] {
  const hasNone = compass.tasks.some((t) => t.sector_id === null);
  const n = compass.sectors.length + (hasNone ? 1 : 0);
  const span = 360 / Math.max(n, 1);
  const list: Sector[] = compass.sectors.map((s, i) => ({ key: s.id, name: `${assumptionLabel}${i + 1}`, center: -90 + (i + 0.5) * span, span }));
  if (hasNone) list.push({ key: null, name: "ひも付けなし", center: -90 + (compass.sectors.length + 0.5) * span, span });
  return list;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Quiet radial chart: centre = goal, distance = how far a task is from it. Names show only on hover / selection. */
export default function CompassChart({
  compass,
  frame,
  selectedId,
  onSelect,
  goalLabel,
  assumptionLabel,
}: {
  compass: Compass;
  frame: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  goalLabel: string;
  assumptionLabel: string;
}) {
  const current = compass.frames.length - 1;
  const sectors = buildSectors(compass, assumptionLabel);
  const angleOf = new Map<string, number>();
  for (const s of sectors) {
    const members = compass.tasks.filter((t) => t.sector_id === s.key);
    const gap = Math.min(SPREAD_DEG, (s.span * 0.8) / Math.max(members.length, 1));
    members.forEach((t, i) => angleOf.set(t.task_id, s.center + (members.length === 1 ? 0 : (i - (members.length - 1) / 2) * gap)));
  }

  return (
    <svg
      viewBox="-300 -260 600 520"
      className="h-full w-full"
      role="group"
      aria-label={`${goalLabel}を中心に、タスクを${goalLabel}との近さで並べた図。中心に近いほど${goalLabel}に合っています。`}
    >
      {[R_IN + 40, (R_IN + R_OUT) / 2, R_OUT].map((r, i) => (
        <circle key={r} r={r} fill="none" className={i === 2 ? "stroke-slate-300" : "stroke-slate-200"} />
      ))}
      {sectors.map((s) => {
        const x = Math.cos(rad(s.center)) * (R_OUT + 18);
        const y = Math.sin(rad(s.center)) * (R_OUT + 18);
        return (
          <text key={s.key ?? "none"} x={x} y={y + 4} textAnchor={Math.abs(x) < 24 ? "middle" : x > 0 ? "start" : "end"} className="fill-slate-500 text-[11px] tracking-wider">
            {s.name}
          </text>
        );
      })}
      <circle r={R_CORE} className="fill-primary" />
      <text y={5} textAnchor="middle" className="fill-white text-[13px] font-bold">
        {goalLabel}
      </text>

      {compass.tasks.map((t) => {
        const pt = t.points[frame];
        const a = rad(angleOf.get(t.task_id) ?? 0);
        const r = pt ? radiusOf(pt.score) : R_PENDING;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const state = stateAt(t, frame, current);
        const selected = t.task_id === selectedId;
        const short = t.title.length > 16 ? `${t.title.slice(0, 15)}…` : t.title;
        return (
          <g key={t.task_id}>
            <line x1={0} y1={0} x2={x} y2={y} className="stroke-primary/10" strokeWidth={1.5} style={{ transition: "all .8s cubic-bezier(.3,.8,.3,1)" }} />
            <g
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${t.title}。${pt ? `近さ ${pt.score}` : "未評価"}${state === "bad" ? "。要確認" : ""}`}
              className="group cursor-pointer outline-none motion-reduce:!transition-none"
              style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform .8s cubic-bezier(.3,.8,.3,1)" }}
              onClick={() => onSelect(t.task_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t.task_id);
                }
              }}
            >
              {state === "bad" && <circle r={22} className="fill-rose-500/15" />}
              <circle
                r={selected ? 17 : 13}
                strokeWidth={state === "none" ? 2 : 3}
                strokeDasharray={state === "none" ? "3 3" : undefined}
                className={cn(
                  "transition-[r] group-hover:[r:17px] group-focus-visible:stroke-primary",
                  state === "bad" && "fill-rose-500 stroke-white",
                  state === "ok" && "fill-indigo-400 stroke-white",
                  state === "none" && "fill-white stroke-slate-400",
                  selected && "!stroke-slate-900",
                )}
              />
              <text
                y={-24}
                textAnchor="middle"
                strokeWidth={4}
                className={cn("pointer-events-none fill-slate-900 text-[13px] font-bold opacity-0 transition-opacity [paint-order:stroke] stroke-white group-hover:opacity-100 group-focus-visible:opacity-100", selected && "opacity-100")}
              >
                {short}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
