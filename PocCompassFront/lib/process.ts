/** Pure helpers for the process organizer (SPEC §14.2). The flow is drawn from process_step items only — no AI. */
import type { ProcessStep } from "./api/client";

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
