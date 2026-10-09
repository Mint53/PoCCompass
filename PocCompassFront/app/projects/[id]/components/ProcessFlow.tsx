"use client";

import type { ProcessStep } from "@/lib/api/client";
import { buildEdges, sortSteps } from "@/lib/process";

const NODE_W = 160;
const NODE_H = 60;
const COL_GAP = 44;
const LANE_H = 100;
const LABEL_W = 120;
const PAD = 16;
const NO_ASSIGNEE = "担当者未設定";

/** Swimlane flow (SPEC §14.2): one lane per assignee, steps left to right in No order. */
export default function ProcessFlow({ steps, title }: { steps: ProcessStep[]; title: string }) {
  const sorted = sortSteps(steps);
  const lanes: string[] = [];
  for (const s of sorted) {
    const name = s.assignee || NO_ASSIGNEE;
    if (!lanes.includes(name)) lanes.push(name);
  }
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
    // going back (loop) or to the same column: leave from the bottom, return to the bottom of the target
    const sx = a.x + NODE_W / 2;
    const sy = a.y + NODE_H;
    const tx = b.x + NODE_W / 2;
    const ty = b.y + NODE_H;
    const dip = 28;
    return `M${sx},${sy} C${sx},${sy + dip} ${tx},${ty + dip} ${tx},${ty}`;
  };

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <svg width="100%" style={{ minWidth: width }} height={height} role="img" aria-label={`${title}のフロー図`} className="block">
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-slate-500" />
          </marker>
        </defs>
        {lanes.map((name, i) => (
          <g key={name}>
            <rect x={0} y={i * LANE_H} width="100%" height={LANE_H} className={i % 2 === 0 ? "fill-slate-50" : "fill-white"} />
            <line x1={0} x2="100%" y1={(i + 1) * LANE_H} y2={(i + 1) * LANE_H} className="stroke-slate-200" />
            <foreignObject x={0} y={i * LANE_H} width={LABEL_W} height={LANE_H}>
              <div className="flex h-full items-center border-r border-slate-200 px-3 text-xs font-bold text-slate-700">
                <span className="line-clamp-3 break-words">{name}</span>
              </div>
            </foreignObject>
          </g>
        ))}
        {buildEdges(sorted).map((e) => (
          <path
            key={`${e.from}-${e.to}`}
            d={edgePath(e.from, e.to)}
            fill="none"
            className="stroke-slate-500"
            strokeWidth={1.5}
            strokeDasharray={pos.get(e.to)!.x <= pos.get(e.from)!.x ? "5 4" : undefined}
            markerEnd="url(#flow-arrow)"
          />
        ))}
        {sorted.map((s) => {
          const p = pos.get(s.id)!;
          return (
            <g key={s.id}>
              <title>{`${s.no}: ${s.content}${s.assignee ? `（${s.assignee}）` : ""}`}</title>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={12} className="fill-white stroke-primary" strokeWidth={1.5} />
              <foreignObject x={p.x} y={p.y} width={NODE_W} height={NODE_H}>
                <div className="flex h-full flex-col justify-center px-3">
                  <span className="text-[11px] font-bold tabular-nums text-primary">{s.no}</span>
                  <span className="line-clamp-2 break-words text-xs leading-4 text-slate-800">{s.content}</span>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
