"use client";

import { Maximize2, Minus, Plus, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessStep } from "@/lib/api/client";
import { assigneesOf, buildEdges, flowEnds, laneTone, NO_ASSIGNEE, sortSteps } from "@/lib/process";
import { cn } from "@/lib/utils";
import Modal from "../../../components/ui/Modal";

const NODE_W = 160;
const NODE_H = 62;
const COL_GAP = 40;
const LANE_H = 86;
const LABEL_W = 112;
const PAD = 16;
/** Never shrink below this scale: past it the diagram scrolls instead of becoming unreadable. */
const MIN_SCALE = 0.55;
const LANE_PAD = 6;
const R = 8;
const ZOOM_BTN = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25";

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
type View = { x: number; y: number; k: number };
type FlowProps = {
  steps: ProcessStep[];
  label: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
};

/**
 * Swimlane flow (SPEC §16.2): one lane per assignee, steps left to right in No order. Click / Enter on a step selects it.
 * Default: the whole diagram is scaled to fit its box. `zoomable`: wheel / buttons zoom, drag pans, "全体に合わせる" refits.
 */
function FlowCanvas({ steps, label, selectedId, onSelect, zoomable = false }: FlowProps & { zoomable?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const moved = useRef(false);
  const drag = useRef<{ px: number; py: number; v: View; id: number } | null>(null);
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

  // Fit the whole diagram into the box (no scrolling); only scroll when it would get smaller than MIN_SCALE.
  const scale = box && box.w > 0 && box.h > 0 ? Math.min(1, Math.max(MIN_SCALE, Math.min(box.w / width, box.h / height))) : 1;

  // Lanes span the whole box even when the diagram itself is narrower.
  const viewW = box && box.w > 0 ? Math.max(width, box.w / scale) : width;

  const fit = useCallback(() => {
    if (!box || box.w <= 0 || box.h <= 0) return;
    const k = Math.min(2, (Math.min(box.w / width, box.h / height)) * 0.96);
    setView({ k, x: (box.w - width * k) / 2, y: (box.h - height * k) / 2 });
  }, [box, width, height]);
  const fitted = useRef(false);
  useEffect(() => {
    if (zoomable && box && !fitted.current) {
      fitted.current = true;
      fit();
    }
  }, [zoomable, box, fit]);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor));
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  }, []);
  const zoomCenter = (factor: number) => box && zoomAt(box.w / 2, box.h / 2, factor);

  useEffect(() => {
    const el = boxRef.current;
    if (!zoomable || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomable, zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!zoomable || e.button !== 0) return;
    moved.current = false;
    drag.current = { px: e.clientX, py: e.clientY, v: view, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!moved.current && Math.hypot(dx, dy) < 4) return;
    if (!moved.current) {
      moved.current = true;
      boxRef.current?.setPointerCapture(d.id);
    }
    setView({ ...d.v, x: d.v.x + dx, y: d.v.y + dy });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

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
    // going back (loop): drop from the bottom of the source to the bottom edge of the lower lane, run left, rise into the target's bottom
    const sx = a.x + NODE_W / 2;
    const sy = a.y + NODE_H;
    const tx = b.x + NODE_W / 2;
    const ty = b.y + NODE_H;
    const lane = Math.max(Math.floor(a.y / LANE_H), Math.floor(b.y / LANE_H));
    const yb = (lane + 1) * LANE_H - LANE_PAD;
    const dir = tx < sx ? -1 : 1;
    return `M${sx},${sy} V${yb - R} Q${sx},${yb} ${sx + dir * R},${yb} H${tx - dir * R} Q${tx},${yb} ${tx},${yb - R} V${ty}`;
  };

  const isBack = (e: { from: string; to: string }) => pos.get(e.to)!.x <= pos.get(e.from)!.x;
  const touches = (e: { from: string; to: string }) => selectedId != null && (e.from === selectedId || e.to === selectedId);
  const dimmed = (e: { from: string; to: string }) => selectedId != null && !touches(e);

  const content = (
    <>
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="fill-slate-400" />
          </marker>
          <marker id="flow-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
          </marker>
        </defs>
        {lanes.map((name, i) => (
          <g key={name}>
            <rect x={0} y={i * LANE_H} width={viewW} height={LANE_H} className={i % 2 === 0 ? "fill-slate-50/70" : "fill-white"} />
            <line x1={0} x2={viewW} y1={(i + 1) * LANE_H} y2={(i + 1) * LANE_H} className="stroke-slate-200" />
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
                if (!moved.current) select();
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
                <div className="flex h-full flex-col justify-center gap-0.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("rounded-md px-1.5 text-[11px] font-bold tabular-nums text-white", tone.dot)}>{s.no}</span>
                    {starts.has(s.id) && <span className="rounded-md bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">開始</span>}
                    {ends.has(s.id) && <span className="rounded-md bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">終了</span>}
                  </div>
                  <p className="line-clamp-2 break-words text-xs leading-4 text-slate-800">{s.content}</p>
                </div>
              </foreignObject>
            </g>
          );
        })}
    </>
  );

  if (zoomable) {
    return (
      <div
        ref={boxRef}
        className="relative h-full min-h-0 cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-slate-200 bg-white active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg width="100%" height="100%" role="group" aria-label={`${label}のフロー図`} className="block" onClick={() => !moved.current && onSelect?.(null)}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {content}
          </g>
        </svg>
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-md" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-label="縮小" title="縮小" onClick={() => zoomCenter(1 / 1.25)} className={ZOOM_BTN}><Minus className="h-4 w-4" aria-hidden="true" /></button>
          <span className="w-12 text-center text-xs font-semibold tabular-nums text-slate-600" aria-live="polite">{Math.round(view.k * 100)}%</span>
          <button type="button" aria-label="拡大" title="拡大" onClick={() => zoomCenter(1.25)} className={ZOOM_BTN}><Plus className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" aria-label="全体に合わせる" title="全体に合わせる" onClick={fit} className={cn(ZOOM_BTN, "w-auto gap-1 px-2 text-xs font-semibold")}><ScanLine className="h-4 w-4" aria-hidden="true" />全体に合わせる</button>
        </div>
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1 text-[11px] text-slate-500 shadow-sm ring-1 ring-slate-200">ドラッグで移動・ホイールで拡大縮小</p>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="thin-scroll h-full min-h-0 overflow-auto rounded-2xl border border-slate-200 bg-white">
      <svg width={viewW * scale} height={height * scale} viewBox={`0 0 ${viewW} ${height}`} role="group" aria-label={`${label}のフロー図`} className="block" onClick={() => onSelect?.(null)}>
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="fill-slate-400" />
          </marker>
          <marker id="flow-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
          </marker>
        </defs>
        {lanes.map((name, i) => (
          <g key={name}>
            <rect x={0} y={i * LANE_H} width={viewW} height={LANE_H} className={i % 2 === 0 ? "fill-slate-50/70" : "fill-white"} />
            <line x1={0} x2={viewW} y1={(i + 1) * LANE_H} y2={(i + 1) * LANE_H} className="stroke-slate-200" />
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
                if (!moved.current) select();
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
                <div className="flex h-full flex-col justify-center gap-0.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("rounded-md px-1.5 text-[11px] font-bold tabular-nums text-white", tone.dot)}>{s.no}</span>
                    {starts.has(s.id) && <span className="rounded-md bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">開始</span>}
                    {ends.has(s.id) && <span className="rounded-md bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">終了</span>}
                  </div>
                  <p className="line-clamp-2 break-words text-xs leading-4 text-slate-800">{s.content}</p>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The fitted diagram, plus a button that opens it large with zoom / pan (AsIs, ToBe and the compare view all use this). */
export default function ProcessFlow(props: FlowProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const controlled = props.selectedId !== undefined;
  return (
    <div className="relative h-full min-h-0">
      <FlowCanvas {...props} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${props.label}のフロー図を拡大して見る`}
        title="拡大して見る"
        className="absolute right-2.5 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        拡大
      </button>
      {open && (
        <Modal open title={`${props.label} のフロー図`} onClose={() => setOpen(false)} className="!max-w-[96vw] h-[92vh]">
          <div className="h-full">
            <FlowCanvas
              steps={props.steps}
              label={props.label}
              zoomable
              selectedId={controlled ? props.selectedId : local}
              onSelect={controlled ? props.onSelect : setLocal}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
