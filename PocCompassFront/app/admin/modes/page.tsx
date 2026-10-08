"use client";

import { RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage, type Mode, type ModeDefinition, type ModeDefinitionBody } from "@/lib/api/client";
import { cn, formatDateTime } from "@/lib/utils";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Field from "../../components/ui/Field";
import Input from "../../components/ui/Input";
import { EmptyState } from "../../components/ui/States";
import Textarea from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/ToastProvider";
import { useApp } from "../../contexts/AppContext";

const LABEL_FIELDS: [keyof ModeDefinitionBody["labels"], string][] = [
  ["goal", "目的（goal）"],
  ["assumption", "仮説（assumption）"],
  ["criterion", "成功条件（criterion）"],
  ["deadline", "期限（deadline）"],
  ["task", "タスク（task）"],
  ["evidence", "検証データ（evidence）"],
  ["decision_continue", "判断: 続行"],
  ["decision_pivot", "判断: 軌道修正"],
  ["decision_stop", "判断: 撤退"],
];
const CARD_FIELDS: [keyof ModeDefinitionBody["card_labels"], string][] = [
  ["drift", "カード: 逸脱"],
  ["drift_hint", "カード: 逸脱の説明"],
  ["unnecessary", "カード: 不要候補"],
  ["unnecessary_hint", "カード: 不要候補の説明"],
  ["deadline_risk", "カード: 期限リスク"],
  ["deadline_risk_hint", "カード: 期限リスクの説明"],
  ["untested", "カード: 未検証"],
  ["untested_hint", "カード: 未検証の説明"],
  ["weak_tasks_title", "TOP5: 紐づきが弱いタスク"],
  ["under_evidenced_title", "TOP5: 根拠不足"],
];
const PLACEHOLDER_FIELDS: [keyof ModeDefinitionBody["placeholders"], string][] = [
  ["title", "入力例: タイトル"],
  ["goal", "入力例: 目的"],
  ["assumption", "入力例: 仮説"],
  ["criterion", "入力例: 成功条件"],
  ["task", "入力例: タスク"],
  ["evidence", "入力例: 検証データ"],
];
const WEIGHT_FIELDS: [keyof ModeDefinitionBody["weights"], string][] = [
  ["alignment", "目的整合"],
  ["validation", "検証の進み"],
  ["schedule", "期限"],
  ["waste", "ムダの少なさ"],
];

function toBody(m: ModeDefinition): ModeDefinitionBody {
  return {
    name: m.name,
    description: m.description,
    labels: { ...m.labels },
    card_labels: { ...m.card_labels },
    placeholders: { ...m.placeholders },
    weights: { ...m.weights },
    prompt_guidance: m.prompt_guidance,
  };
}

export default function AdminModesPage() {
  const { me, modes, reloadModes } = useApp();
  const { toast } = useToast();
  const [current, setCurrent] = useState<Mode>(modes[0].id);
  const def = useMemo(() => modes.find((m) => m.id === current)!, [modes, current]);
  const [body, setBody] = useState<ModeDefinitionBody>(toBody(def));
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Re-sync after save/reset reloads the definitions. Tab switches go through selectMode so the form and
  // the save target change in the same render (an effect alone leaves one render where they disagree).
  useEffect(() => setBody(toBody(def)), [def]);

  const selectMode = (id: Mode) => {
    setCurrent(id);
    setBody(toBody(modes.find((m) => m.id === id)!));
  };

  if (!me.is_admin) {
    return <EmptyState title="管理者のみ利用できます" description="モード定義の編集は管理者（ADMIN_EMAILS に登録されたユーザー）のみ行えます。" />;
  }

  const weightSum = Object.values(body.weights).reduce((a, b) => a + b, 0);
  const emptyLabel = [...Object.values(body.labels), ...Object.values(body.card_labels), body.name].some((v) => !v.trim());

  const save = async () => {
    setBusy(true);
    try {
      await api.updateMode(current, body);
      await reloadModes();
      toast({ tone: "success", message: `モード「${body.name}」を保存しました。` });
    } catch (e) {
      toast({ tone: "error", title: "保存できませんでした", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api.resetMode(current);
      await reloadModes();
      setConfirmReset(false);
      toast({ tone: "success", message: "既定値に戻しました。" });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const textGrid = <K extends "labels" | "card_labels" | "placeholders">(group: K, fields: [keyof ModeDefinitionBody[K], string][]) => (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map(([key, label]) => (
        <Field key={String(key)} label={label} htmlFor={`${group}-${String(key)}`}>
          <Input
            id={`${group}-${String(key)}`}
            value={body[group][key] as string}
            onChange={(e) => setBody((b) => ({ ...b, [group]: { ...b[group], [key]: e.target.value } }))}
            disabled={busy}
          />
        </Field>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">モード設定</h1>
        <p className="mt-1 text-sm text-slate-600">
          モードごとの項目名・入力例・AI への指示・健全度の重みを変更できます。変更は全ての取り組みに即時反映されます。
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={current === m.id}
            onClick={() => selectMode(m.id)}
            className={cn(
              "h-10 rounded-full border px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring",
              current === m.id ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {m.name}
          </button>
        ))}
      </div>

      <Card
        title={`${def.name}（${def.id}）`}
        actions={
          <>
            <span className="text-xs text-slate-500">{def.updated_at ? `最終更新 ${formatDateTime(def.updated_at)} ${def.updated_by ?? ""}` : "既定値"}</span>
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={busy}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              既定値に戻す
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={busy || emptyLabel || weightSum <= 0}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {busy ? "保存中..." : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="モード名" htmlFor="mode-name" required>
              <Input id="mode-name" value={body.name} maxLength={30} onChange={(e) => setBody({ ...body, name: e.target.value })} disabled={busy} />
            </Field>
            <Field label="説明" htmlFor="mode-desc">
              <Input id="mode-desc" value={body.description} maxLength={300} onChange={(e) => setBody({ ...body, description: e.target.value })} disabled={busy} />
            </Field>
          </div>
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">項目名</h3>
            {textGrid("labels", LABEL_FIELDS)}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">ダッシュボードの表示名</h3>
            {textGrid("card_labels", CARD_FIELDS)}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">入力例</h3>
            {textGrid("placeholders", PLACEHOLDER_FIELDS)}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">健全度の重み（0〜1。合計で割って使います）</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {WEIGHT_FIELDS.map(([key, label]) => (
                <Field key={key} label={label} htmlFor={`w-${key}`}>
                  <Input
                    id={`w-${key}`}
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={body.weights[key]}
                    onChange={(e) => setBody({ ...body, weights: { ...body.weights, [key]: Math.max(0, Math.min(1, Number(e.target.value) || 0)) } })}
                    disabled={busy}
                  />
                </Field>
              ))}
            </div>
            <p className={cn("text-xs", weightSum <= 0 ? "text-rose-700" : "text-slate-500")}>合計 {weightSum.toFixed(2)}</p>
          </section>
          <section className="space-y-3">
            <Field label="AI への指示（このモードでの考え方）" htmlFor="guidance" hint="判定基準そのもの（スコア帯・verdict の定義）は共通です。ここにはこのモード特有の「何を高く評価し、何を不要とみなすか」を書きます。変更後は判定の傾向を確認してください。">
              <Textarea id="guidance" rows={8} value={body.prompt_guidance} maxLength={4000} onChange={(e) => setBody({ ...body, prompt_guidance: e.target.value })} disabled={busy} />
            </Field>
          </section>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title="既定値に戻しますか？"
        description={`「${def.name}」の項目名・入力例・AI への指示・重みを初期値に戻します。`}
        confirmLabel="既定値に戻す"
        busy={busy}
        onConfirm={reset}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
