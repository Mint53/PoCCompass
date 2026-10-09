"use client";

import type { ProcessStep } from "@/lib/api/client";
import { assigneesOf, buildEdges, flowEnds, laneTone, NO_ASSIGNEE, sortSteps } from "@/lib/process";
import { cn } from "@/lib/utils";

const NODE_W = 176;
const NODE_H = 72;
const COL_GAP = 48;
const LANE_H = 112;
const LABEL_W = 132;
const PAD = 20;

/** Swimlane flow (SPEC §16.2): one lane per assignee, steps left to right in No order. Click / Enter on a step selects it. */
export default function ProcessFlow({
  steps,
  label,
  selectedId,
  onSelect,
}: {
  steps: ProcessStep[];
  label: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const sorted = sortSteps(steps);
  const lanes = assigneesOf(sorted);
  const { starts, ends } = flowEnds(sorted);
  const edges = buildEdges(sorted);
  const pos = new Map(
    sorted.map((s, i) => [
      s.id,
      { x: LABEL_W + PAD + i * (NODE_W + COL_GAP), y: lanes.indexOf(s.assignee || NO_ASSIGNEE) * LANE_H + (LANE_H - NODE_H) / 2 },
    ]),
  );
  const width = LABEL_W + PAD * 2 + sorted.length * (NODE_W + COL_GAP) - COL_GAP;
  const height = lanes.length * LANE_H;

  const edgePath = (fromId: string, toId: string): string => {
    const a = pos.get(fromId)!;
    const b = pos.get(toId)!;
    if (b.x > a.x) {
      const sx = a.x + NODE_W;
      const sy = a.y + NODE_H / 2;
      const tx = b.x;
      const ty = b.y + NODE_H / 2;
      const mx = (sx + tx) / 2;
      return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
    }
    // going back (loop): leave from the bottom, return to the bottom of the target
    const sx = a.x + NODE_W / 2;
    const sy = a.y + NODE_H;
    const tx = b.x + NODE_W / 2;
    const ty = b.y + NODE_H;
    return `M${sx},${sy} C${sx},${sy + 36} ${tx},${ty + 36} ${tx},${ty}`;
  };

  const isBack = (e: { from: string; to: string }) => pos.get(e.to)!.x <= pos.get(e.from)!.x;
  const touches = (e: { from: string; to: string }) => selectedId != null && (e.from === selectedId || e.to === selectedId);
  const dimmed = (e: { from: string; to: string }) => selectedId != null && !touches(e);

  return (
    <div className="thin-scroll overflow-auto rounded-2xl border border-slate-200 bg-white">
      <svg width="100%" style={{ minWidth: width }} height={height} role="group" aria-label={`${label}のフロー図`} className="block" onClick={() => onSelect?.(null)}>
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="fill-slate-400" />
          </marker>
          <marker id="flow-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
          </marker>
        </defs>
        {lanes.map((name, i) => (
          <g key={name}>
            <rect x={0} y={i * LANE_H} width="100%" height={LANE_H} className={i % 2 === 0 ? "fill-slate-50/70" : "fill-white"} />
            <line x1={0} x2="100%" y1={(i + 1) * LANE_H} y2={(i + 1) * LANE_H} className="stroke-slate-200" />
            <foreignObject x={0} y={i * LANE_H} width={LABEL_W} height={LANE_H}>
              <div className="flex h-full items-center gap-2 border-r border-slate-200 bg-white/80 px-3">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", laneTone(i).dot)} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="line-clamp-2 break-words text-xs font-bold text-slate-800">{name}</p>
                  <p className="text-[11px] tabular-nums text-slate-500">{sorted.filter((s) => (s.assignee || NO_ASSIGNEE) === name).length} 件</p>
                </div>
              </div>
            </foreignObject>
          </g>
        ))}
        {edges.map((e) => (
          <path
            key={`${e.from}-${e.to}`}
            d={edgePath(e.from, e.to)}
            fill="none"
            className={cn("transition-opacity", touches(e) ? "stroke-primary" : "stroke-slate-400", dimmed(e) && "opacity-25")}
            strokeWidth={touches(e) ? 2.25 : 1.5}
            strokeDasharray={isBack(e) ? "5 4" : undefined}
            markerEnd={touches(e) ? "url(#flow-arrow-hot)" : "url(#flow-arrow)"}
          />
        ))}
        {sorted.map((s) => {
          const p = pos.get(s.id)!;
          const tone = laneTone(lanes.indexOf(s.assignee || NO_ASSIGNEE));
          const selected = s.id === selectedId;
          const select = () => onSelect?.(selected ? null : s.id);
          return (
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`業務${s.no}: ${s.content}${s.assignee ? `（${s.assignee}）` : ""}`}
              className="group cursor-pointer outline-none"
              onClick={(ev) => {
                ev.stopPropagation();
                select();
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  select();
                }
              }}
            >
              <title>{`${s.no}: ${s.content}${s.assignee ? `（${s.assignee}）` : ""}`}</title>
              {selected && <rect x={p.x - 4} y={p.y - 4} width={NODE_W + 8} height={NODE_H + 8} rx={18} className="fill-none stroke-primary/25" strokeWidth={6} />}
              <rect
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx={14}
                strokeWidth={selected ? 2 : 1}
                className={cn(
                  "fill-white transition group-hover:stroke-slate-400 group-focus-visible:stroke-primary",
                  selected ? "stroke-primary" : "stroke-slate-200",
                )}
                style={{ filter: "drop-shadow(0 1px 2px rgb(15 23 42 / 0.08))" }}
              />
              <rect x={p.x} y={p.y + 14} width={4} height={NODE_H - 28} rx={2} className={tone.band} />
              <foreignObject x={p.x + 4} y={p.y} width={NODE_W - 4} height={NODE_H} pointerEvents="none">
                <div className="flex h-full flex-col justify-center gap-1 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("rounded-md px-1.5 text-[11px] font-bold tabular-nums text-white", tone.dot)}>{s.no}</span>
                    {starts.has(s.id) && <span className="rounded-md bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">開始</span>}
                    {ends.has(s.id) && <span className="rounded-md bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">終了</span>}
                  </div>
                  <p className="line-clamp-2 break-words text-xs leading-[1.15rem] text-slate-800">{s.content}</p>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
