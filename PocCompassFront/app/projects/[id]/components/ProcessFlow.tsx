"use client";

import { Maximize2, Minus, Plus, ScanLine, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessStep } from "@/lib/api/client";
import { assigneesOf, buildEdges, flowEnds, laneTone, noForInsert, NO_ASSIGNEE, outgoingNos, sortSteps } from "@/lib/process";
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
/** GUI editing hooks (SPEC §16.2). Omit `edit` for a read-only diagram. The page does the saving; the diagram decides what changed. */
export type FlowEdit = {
  busy?: boolean;
  onMove: (step: ProcessStep, change: { assignee?: string; no?: string }) => void;
  onLink: (step: ProcessStep, nextNos: string[]) => void;
  onEditStep: (step: ProcessStep) => void;
  onDeleteStep: (step: ProcessStep) => void;
  onAddStep: (assignee: string) => void;
  onNotice: (message: string) => void;
};
type FlowProps = {
  steps: ProcessStep[];
  label: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  edit?: FlowEdit;
};
type Gesture =
  | { kind: "move"; id: string; offX: number; offY: number; x: number; y: number; active: boolean }
  | { kind: "link"; from: string; replace?: string; x: number; y: number };
const DRAG_THRESHOLD = 4;
const HANDLE_R = 6;

/**
 * Swimlane flow (SPEC §16.2): one lane per assignee, steps left to right in No order. Click / Enter on a step selects it.
 * Default: the whole diagram is scaled to fit its box. `zoomable`: wheel / buttons zoom, drag pans, "全体に合わせる" refits.
 */
function FlowCanvas({ steps, label, selectedId, onSelect, edit, zoomable = false }: FlowProps & { zoomable?: boolean }) {
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
  const gRef = useRef<SVGGElement>(null);
  const [gest, setGest] = useState<Gesture | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const [edgeSel, setEdgeSel] = useState<string | null>(null);
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

  /** Path of an arrow, plus its midpoint (delete button) and tip (reconnect handle). */
  const edgeGeom = (fromId: string, toId: string) => {
    const a = pos.get(fromId)!;
    const b = pos.get(toId)!;
    if (b.x > a.x) {
      const sx = a.x + NODE_W;
      const sy = a.y + NODE_H / 2;
      const tx = b.x;
      const ty = b.y + NODE_H / 2;
      const mx = (sx + tx) / 2;
      return { d: `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`, mid: { x: mx, y: (sy + ty) / 2 }, tip: { x: tx, y: ty } };
    }
    // going back (loop): drop from the bottom of the source to the bottom edge of the lower lane, run left, rise into the target's bottom
    const sx = a.x + NODE_W / 2;
    const sy = a.y + NODE_H;
    const tx = b.x + NODE_W / 2;
    const ty = b.y + NODE_H;
    const lane = Math.max(Math.floor(a.y / LANE_H), Math.floor(b.y / LANE_H));
    const yb = (lane + 1) * LANE_H - LANE_PAD;
    const dir = tx < sx ? -1 : 1;
    return {
      d: `M${sx},${sy} V${yb - R} Q${sx},${yb} ${sx + dir * R},${yb} H${tx - dir * R} Q${tx},${yb} ${tx},${yb - R} V${ty}`,
      mid: { x: (sx + tx) / 2, y: yb },
      tip: { x: tx, y: ty },
    };
  };

  // ---- GUI editing -------------------------------------------------------------------------------------------------
  const toDiagram = (e: { clientX: number; clientY: number }) => {
    const m = gRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const stepAt = (x: number, y: number) => sorted.find((s) => {
    const p = pos.get(s.id)!;
    return x >= p.x && x <= p.x + NODE_W && y >= p.y && y <= p.y + NODE_H;
  });
  /** Where a dragged step would land: lane + insertion index among the other steps. */
  const dropTarget = (g: Extract<Gesture, { kind: "move" }>) => {
    const laneIdx = Math.min(lanes.length - 1, Math.max(0, Math.floor(g.y / LANE_H)));
    const cx = g.x - g.offX + NODE_W / 2;
    const others = sorted.filter((o) => o.id !== g.id);
    const index = others.filter((o) => pos.get(o.id)!.x + NODE_W / 2 < cx).length;
    return { laneIdx, others, index, current: sorted.findIndex((o) => o.id === g.id) };
  };
  const beginMove = (ev: React.PointerEvent, s: ProcessStep) => {
    if (!edit || edit.busy || ev.button !== 0) return;
    ev.stopPropagation();
    moved.current = false;
    const pt = toDiagram(ev);
    const p = pos.get(s.id)!;
    press.current = { x: ev.clientX, y: ev.clientY };
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setGest({ kind: "move", id: s.id, offX: pt.x - p.x, offY: pt.y - p.y, x: pt.x, y: pt.y, active: false });
  };
  const beginLink = (ev: React.PointerEvent, from: string, replace?: string) => {
    if (!edit || edit.busy || ev.button !== 0) return;
    ev.stopPropagation();
    moved.current = true;
    const pt = toDiagram(ev);
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setGest({ kind: "link", from, replace, x: pt.x, y: pt.y });
  };
  const onGestureMove = (ev: React.PointerEvent) => {
    if (!gest) return;
    const pt = toDiagram(ev);
    if (gest.kind === "move") {
      const st = press.current;
      const active = gest.active || (!!st && Math.hypot(ev.clientX - st.x, ev.clientY - st.y) >= DRAG_THRESHOLD);
      if (active) moved.current = true;
      setGest({ ...gest, x: pt.x, y: pt.y, active });
    } else {
      setGest({ ...gest, x: pt.x, y: pt.y });
    }
  };
  const onGestureEnd = (ev: React.PointerEvent, cancelled = false) => {
    const g = gest;
    setGest(null);
    press.current = null;
    if (!g || !edit || cancelled) return;
    if (g.kind === "move") {
      const s = sorted.find((x) => x.id === g.id);
      if (!s || !g.active) return;
      const { laneIdx, others, index, current } = dropTarget(g);
      const change: { assignee?: string; no?: string } = {};
      if ((s.assignee || NO_ASSIGNEE) !== lanes[laneIdx]) change.assignee = lanes[laneIdx] === NO_ASSIGNEE ? "" : lanes[laneIdx];
      if (index !== current) {
        const no = noForInsert(others, index);
        if (no === null) edit.onNotice("この位置に置ける業務Noが決められませんでした。編集で業務Noを変えてください。");
        else change.no = no;
      }
      if (Object.keys(change).length > 0) edit.onMove(s, change);
      return;
    }
    const from = sorted.find((x) => x.id === g.from);
    const pt = toDiagram(ev);
    const target = stepAt(pt.x, pt.y);
    if (!from || !target || target.id === from.id) return;
    const current = outgoingNos(from, sorted);
    const next = [...new Set(g.replace ? current.map((n) => (n === g.replace ? target.no : n)) : [...current, target.no])];
    if (next.length === current.length && next.every((n, i) => n === current[i])) return;
    setEdgeSel(null);
    edit.onLink(from, next);
  };
  const removeEdge = (fromId: string, toId: string) => {
    if (!edit || edit.busy) return;
    const from = sorted.find((x) => x.id === fromId);
    const to = sorted.find((x) => x.id === toId);
    if (!from || !to) return;
    const next = outgoingNos(from, sorted).filter((n) => n !== to.no);
    if (next.length === 0 && sorted[sorted.length - 1].id !== from.id) {
      edit.onNotice("この矢印を消すと、番号順の次の業務につながってしまいます。矢印の先端をドラッグして、つなぎ先を変えてください。");
      return;
    }
    setEdgeSel(null);
    edit.onLink(from, next);
  };
  const selectedEdge = edit ? edges.find((e) => `${e.from}-${e.to}` === edgeSel) : undefined;
  const dragMove = gest?.kind === "move" && gest.active ? gest : null;
  const drop = dragMove ? dropTarget(dragMove) : null;
  const linkHover = gest?.kind === "link" ? stepAt(gest.x, gest.y) : undefined;

  const isBack = (e: { from: string; to: string }) => pos.get(e.to)!.x <= pos.get(e.from)!.x;
  const touches = (e: { from: string; to: string }) => selectedId != null && (e.from === selectedId || e.to === selectedId);
  const dimmed = (e: { from: string; to: string }) => selectedId != null && !touches(e);

  const content = (
    <g ref={gRef} onPointerMove={onGestureMove}>
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
            <rect
              x={0}
              y={i * LANE_H}
              width={viewW}
              height={LANE_H}
              className={i % 2 === 0 ? "fill-slate-50/70" : "fill-white"}
              onDoubleClick={edit ? () => !edit.busy && edit.onAddStep(name === NO_ASSIGNEE ? "" : name) : undefined}
            />
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
        {edges.map((e) => {
          const key = `${e.from}-${e.to}`;
          const hot = touches(e) || key === edgeSel;
          return (
            <g key={key}>
              <path
                d={edgeGeom(e.from, e.to).d}
                fill="none"
                className={cn("transition-opacity", hot ? "stroke-primary" : "stroke-slate-400", dimmed(e) && key !== edgeSel && "opacity-25")}
                strokeWidth={hot ? 2.25 : 1.5}
                strokeDasharray={isBack(e) ? "5 4" : undefined}
                markerEnd={hot ? "url(#flow-arrow-hot)" : "url(#flow-arrow)"}
              />
              {edit && (
                <path
                  d={edgeGeom(e.from, e.to).d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  className="cursor-pointer"
                  pointerEvents="stroke"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect?.(null);
                    setEdgeSel(key === edgeSel ? null : key);
                  }}
                >
                  <title>クリックで矢印を選ぶ（消す・つなぎ直す）</title>
                </path>
              )}
            </g>
          );
        })}
        {sorted.map((s) => {
          const p = pos.get(s.id)!;
          const tone = laneTone(lanes.indexOf(s.assignee || NO_ASSIGNEE));
          const selected = s.id === selectedId;
          const select = () => {
            setEdgeSel(null);
            onSelect?.(selected ? null : s.id);
          };
          const dragging = gest?.kind === "move" && gest.active && gest.id === s.id;
          return (
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`業務${s.no}: ${s.content}${s.assignee ? `（${s.assignee}）` : ""}`}
              className={cn("group outline-none", edit ? "cursor-grab" : "cursor-pointer", dragging && "opacity-40")}
              style={edit ? { touchAction: "none" } : undefined}
              onPointerDown={(ev) => beginMove(ev, s)}
              onPointerUp={onGestureEnd}
              onPointerCancel={(ev) => onGestureEnd(ev, true)}
              onDoubleClick={edit ? () => !edit.busy && edit.onEditStep(s) : undefined}
              onClick={(ev) => {
                ev.stopPropagation();
                if (!moved.current) select();
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  select();
                } else if (edit && !edit.busy && (ev.key === "Delete" || ev.key === "Backspace")) {
                  ev.preventDefault();
                  edit.onDeleteStep(s);
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
              {edit && (
                <circle
                  cx={p.x + NODE_W}
                  cy={p.y + NODE_H / 2}
                  r={HANDLE_R}
                  className={cn("cursor-crosshair fill-white stroke-primary transition-opacity group-hover:opacity-100", selected ? "opacity-100" : "opacity-0")}
                  strokeWidth={2}
                  onPointerDown={(ev) => beginLink(ev, s.id)}
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <title>ドラッグして別の業務につなぐ（矢印を足す）</title>
                </circle>
              )}
            </g>
          );
        })}
        {edit && selectedEdge && (() => {
          const g = edgeGeom(selectedEdge.from, selectedEdge.to);
          return (
            <g>
              <circle cx={g.tip.x} cy={g.tip.y} r={HANDLE_R + 2} className="cursor-grab fill-white stroke-primary" strokeWidth={2} onPointerDown={(ev) => beginLink(ev, selectedEdge.from, sorted.find((x) => x.id === selectedEdge.to)!.no)} onPointerUp={onGestureEnd} onPointerCancel={(ev) => onGestureEnd(ev, true)}>
                <title>ドラッグで矢印のつなぎ先を変える</title>
              </circle>
              <g role="button" tabIndex={0} aria-label="この矢印を消す" className="cursor-pointer outline-none" onClick={(ev) => { ev.stopPropagation(); removeEdge(selectedEdge.from, selectedEdge.to); }} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); removeEdge(selectedEdge.from, selectedEdge.to); } }}>
                <title>この矢印を消す</title>
                <circle cx={g.mid.x} cy={g.mid.y} r={10} className="fill-white stroke-rose-400" strokeWidth={1.5} />
                <path d={`M${g.mid.x - 3.5},${g.mid.y - 3.5} l7,7 m0,-7 l-7,7`} className="stroke-rose-500" strokeWidth={1.75} strokeLinecap="round" fill="none" />
              </g>
            </g>
          );
        })()}
        {dragMove && drop && (
          <g pointerEvents="none">
            <rect x={0} y={drop.laneIdx * LANE_H} width={viewW} height={LANE_H} className="fill-primary/10" />
            {drop.index !== drop.current && (() => {
              const x = drop.index === 0 ? pos.get(drop.others[0].id)!.x - COL_GAP / 2 : pos.get(drop.others[drop.index - 1].id)!.x + NODE_W + COL_GAP / 2;
              return <line x1={x} x2={x} y1={drop.laneIdx * LANE_H + 6} y2={(drop.laneIdx + 1) * LANE_H - 6} className="stroke-primary" strokeWidth={3} strokeLinecap="round" />;
            })()}
            <rect x={dragMove.x - dragMove.offX} y={dragMove.y - dragMove.offY} width={NODE_W} height={NODE_H} rx={14} className="fill-white/90 stroke-primary" strokeWidth={2} strokeDasharray="6 4" />
            <text x={dragMove.x - dragMove.offX + 12} y={dragMove.y - dragMove.offY + NODE_H / 2 + 4} className="fill-primary text-xs font-bold">{sorted.find((x) => x.id === dragMove.id)?.no}</text>
          </g>
        )}
        {gest?.kind === "link" && (() => {
          const a = pos.get(gest.from)!;
          return (
            <g pointerEvents="none">
              <path d={`M${a.x + NODE_W},${a.y + NODE_H / 2} L${gest.x},${gest.y}`} className="stroke-primary" strokeWidth={2} strokeDasharray="6 4" fill="none" markerEnd="url(#flow-arrow-hot)" />
              {linkHover && linkHover.id !== gest.from && (() => {
                const p = pos.get(linkHover.id)!;
                return <rect x={p.x - 4} y={p.y - 4} width={NODE_W + 8} height={NODE_H + 8} rx={18} className="fill-primary/10 stroke-primary" strokeWidth={2} />;
              })()}
            </g>
          );
        })()}
    </g>
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
        <svg width="100%" height="100%" role="group" aria-label={`${label}のフロー図`} className="block" onClick={() => { if (!moved.current) { setEdgeSel(null); onSelect?.(null); } }}>
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
        <p className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-22rem)] rounded-lg bg-white/90 px-2.5 py-1 text-[11px] text-slate-500 shadow-sm ring-1 ring-slate-200">{edit ? "背景ドラッグで移動・ホイールで拡大縮小／業務をドラッグで並べ替え・● から矢印／ダブルクリックで編集・追加" : "ドラッグで移動・ホイールで拡大縮小"}</p>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="thin-scroll h-full min-h-0 overflow-auto rounded-2xl border border-slate-200 bg-white">
      <svg width={viewW * scale} height={height * scale} viewBox={`0 0 ${viewW} ${height}`} role="group" aria-label={`${label}のフロー図`} className="block" onClick={() => { setEdgeSel(null); onSelect?.(null); }}>
        {content}
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
              edit={props.edit}
              selectedId={controlled ? props.selectedId : local}
              onSelect={controlled ? props.onSelect : setLocal}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
