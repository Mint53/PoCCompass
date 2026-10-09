/**
 * Fixed UI vocabulary for enum values that are NOT mode-dependent.
 * Mode-dependent words (仮説 / 前提 / 原因仮説 ...) come from ModeDefinition.labels — do not add them here.
 */
import type { BadgeVariant } from "@/app/components/ui/Badge";
import type { Verdict } from "./api/client";

export const VERDICT_LABEL: Record<Verdict, { label: string; variant: BadgeVariant }> = {
  aligned: { label: "目的に合致", variant: "green" },
  weak: { label: "紐づき弱", variant: "yellow" },
  drift: { label: "逸脱の疑い", variant: "red" },
  unnecessary_candidate: { label: "不要候補", variant: "orange" },
};

export const TASK_STATUS = [
  { value: "todo", label: "未着手" },
  { value: "doing", label: "進行中" },
  { value: "done", label: "完了" },
] as const;

export const ASSUMPTION_STATUS = [
  { value: "untested", label: "未検証" },
  { value: "testing", label: "検証中" },
  { value: "supported", label: "支持された" },
  { value: "rejected", label: "否定された" },
] as const;

export const CRITERION_STATUS = [
  { value: "not_met", label: "未達成" },
  { value: "met", label: "達成" },
] as const;

export const PRIORITY = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
] as const;

export const EVIDENCE_RESULT = [
  { value: "supports", label: "支持する" },
  { value: "refutes", label: "否定する" },
  { value: "inconclusive", label: "判断できない" },
] as const;

export const REQUEST_KIND = [
  { value: "request", label: "要望" },
  { value: "issue", label: "課題" },
] as const;

export const REQUEST_ACTION = [
  { value: "undecided", label: "未判断" },
  { value: "needed", label: "対応要" },
  { value: "not_needed", label: "対応不要" },
] as const;

export const PROCESS_VARIANT = [
  { value: "asis", label: "AsIs（現状）" },
  { value: "tobe", label: "ToBe（あるべき姿）" },
] as const;

export const PROJECT_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: "進行中", variant: "brand" },
  stopped: { label: "停止", variant: "slate" },
  completed: { label: "完了", variant: "green" },
};

export const USER_ROLE = [
  { value: "admin", label: "管理者", hint: "全ての取り組みを閲覧・編集。ユーザー管理・モード設定ができる" },
  { value: "global_viewer", label: "全体閲覧者", hint: "全ての取り組みを閲覧のみ" },
  { value: "general", label: "一般", hint: "メンバーに入った取り組みと、自分の部署に公開された取り組み" },
] as const;

export function labelOf<T extends { value: string; label: string }>(list: readonly T[], value: string): string {
  return list.find((x) => x.value === value)?.label ?? value;
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-slate-400";
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-rose-600";
}
