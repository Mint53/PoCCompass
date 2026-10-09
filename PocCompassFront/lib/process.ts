/** Pure helpers for the process organizer (SPEC §16.2). The flow is drawn from process_step items only — no AI. */
import type { ProcessStep } from "./api/client";

export const NO_ASSIGNEE = "担当者未設定";

/** Natural order: digits compare as numbers ("2" < "10", "2" < "2a" < "3"). */
export function compareNo(a: string, b: string): number {
  return a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" });
}

export function sortSteps(steps: ProcessStep[]): ProcessStep[] {
  return [...steps].sort((a, b) => compareNo(a.no, b.no));
}

export type FlowEdge = { from: string; to: string };

/** Edge = next_nos when given, otherwise the next step in order. Unknown targets are dropped; the last step has none. */
export function buildEdges(sorted: ProcessStep[]): FlowEdge[] {
  const byNo = new Map(sorted.map((s) => [s.no, s]));
  const edges: FlowEdge[] = [];
  sorted.forEach((s, i) => {
    if (s.next_nos.length > 0) {
      for (const n of s.next_nos) {
        const to = byNo.get(n);
        if (to) edges.push({ from: s.id, to: to.id });
      }
    } else if (i < sorted.length - 1) {
      edges.push({ from: s.id, to: sorted[i + 1].id });
    }
  });
  return edges;
}

/** next_nos entries that point at no step of this variant (shown as a warning in the table). */
export function danglingNos(step: ProcessStep, all: ProcessStep[]): string[] {
  const known = new Set(all.map((s) => s.no));
  return step.next_nos.filter((n) => !known.has(n));
}

/** Suggest the next number: max numeric No + 1, or "1". */
export function suggestNo(steps: ProcessStep[]): string {
  const nums = steps.map((s) => Number(s.no)).filter((n) => Number.isInteger(n) && n > 0);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

/** Assignees in order of first appearance (by No); steps without an assignee share one lane. */
export function assigneesOf(sorted: ProcessStep[]): string[] {
  const out: string[] = [];
  for (const s of sorted) {
    const name = s.assignee || NO_ASSIGNEE;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Start = no step points at it; end = it points at nothing. Used for the 開始 / 終了 markers. */
export function flowEnds(sorted: ProcessStep[]): { starts: Set<string>; ends: Set<string> } {
  const edges = buildEdges(sorted);
  const hasIn = new Set(edges.map((e) => e.to));
  const hasOut = new Set(edges.map((e) => e.from));
  return {
    starts: new Set(sorted.filter((s) => !hasIn.has(s.id)).map((s) => s.id)),
    ends: new Set(sorted.filter((s) => !hasOut.has(s.id)).map((s) => s.id)),
  };
}

/** One tone per assignee (cycled). Full class strings so Tailwind keeps them. */
export const LANE_TONES = [
  { dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", stroke: "stroke-indigo-500", band: "fill-indigo-500", soft: "fill-indigo-50/60" },
  { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", stroke: "stroke-emerald-500", band: "fill-emerald-500", soft: "fill-emerald-50/60" },
  { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800 ring-amber-200", stroke: "stroke-amber-500", band: "fill-amber-500", soft: "fill-amber-50/60" },
  { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 ring-sky-200", stroke: "stroke-sky-500", band: "fill-sky-500", soft: "fill-sky-50/60" },
  { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-200", stroke: "stroke-rose-500", band: "fill-rose-500", soft: "fill-rose-50/60" },
  { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-200", stroke: "stroke-violet-500", band: "fill-violet-500", soft: "fill-violet-50/60" },
] as const;

export const laneTone = (index: number) => LANE_TONES[index % LANE_TONES.length];
