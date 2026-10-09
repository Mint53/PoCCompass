"use client";

import { ArrowLeft, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage, type Mode } from "@/lib/api/client";
import { PRIORITY } from "@/lib/labels";
import { cn, todayIso } from "@/lib/utils";
import ListEditor, { type ListRow } from "../../components/ListEditor";
import DepartmentShare from "../../components/DepartmentShare";
import MemberPicker, { type PickerMember } from "../../components/MemberPicker";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DateField from "../../components/ui/DateField";
import Field from "../../components/ui/Field";
import Input from "../../components/ui/Input";
import { LoadingState } from "../../components/ui/States";
import Textarea from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/ToastProvider";
import { useApp } from "../../contexts/AppContext";

type Errors = Partial<Record<"title" | "goal" | "deadline" | "assumptions" | "criteria", string>>;

function NewProjectForm() {
  const { modes, modeOf, me } = useApp();
  const router = useRouter();
  const { toast } = useToast();
  const params = useSearchParams();
  const initial = modes.find((m) => m.id === params.get("mode"))?.id ?? null;

  const [mode, setMode] = useState<Mode | null>(initial);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [deadline, setDeadline] = useState("");
  const [assumptions, setAssumptions] = useState<ListRow[]>([{ text: "", extra: "high" }]);
  const [criteria, setCriteria] = useState<ListRow[]>([{ text: "", extra: "" }]);
  const [picked, setPicked] = useState<PickerMember[]>([]);
  const [shareDept, setShareDept] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  if (!mode) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">新しい取り組み</h1>
          <p className="mt-1 text-sm text-slate-600">どの種類の取り組みですか？ 選んだモードに合わせて項目名と AI の判定基準が変わります。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <span className="text-lg font-bold text-primary">{m.name}</span>
              <span className="text-sm text-slate-600">{m.description}</span>
              <span className="mt-auto flex flex-wrap gap-1.5 text-xs text-slate-500">
                {[m.labels.goal, m.labels.assumption, m.labels.criterion, m.labels.task].map((l) => (
                  <span key={l} className="rounded bg-slate-100 px-1.5 py-0.5">
                    {l}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const def = modeOf(mode);
  const lb = def.labels;

  const validate = (): Errors => {
    const e: Errors = {};
    if (!title.trim()) e.title = "タイトルを入力してください。";
    if (!goal.trim()) e.goal = `${lb.goal}を入力してください。`;
    if (!deadline) e.deadline = `${lb.deadline}を入力してください。`;
    else if (startDate && deadline < startDate) e.deadline = `${lb.deadline}は開始日以降の日付にしてください。`;
    if (!assumptions.some((a) => a.text.trim())) e.assumptions = `${lb.assumption}を 1 つ以上入力してください（AI の判定に必要です）。`;
    if (!criteria.some((c) => c.text.trim())) e.criteria = `${lb.criterion}を 1 つ以上入力してください（AI の判定に必要です）。`;
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const project = await api.createProject({
        mode,
        title: title.trim(),
        goal: goal.trim(),
        start_date: startDate || null,
        deadline,
        members: picked.filter((m) => m.role === "editor").map((m) => m.email),
        viewers: picked.filter((m) => m.role === "viewer").map((m) => m.email),
        share_with_department: shareDept,
        assumptions: assumptions
          .filter((a) => a.text.trim())
          .map((a) => ({ text: a.text.trim(), priority: a.extra as "high" | "medium" | "low" })),
        criteria: criteria.filter((c) => c.text.trim()).map((c) => ({ text: c.text.trim(), target: c.extra.trim() })),
      });
      toast({ tone: "success", message: "取り組みを作成しました。次にタスクを登録してください。" });
      router.push(`/projects/${project.id}/tasks`);
    } catch (err) {
      toast({ tone: "error", title: "作成できませんでした", message: errorMessage(err) });
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setMode(null)} disabled={saving}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          モードを選び直す
        </Button>
        <h1 className="text-xl font-bold text-slate-900">新しい取り組み（{def.name}）</h1>
      </div>

      <Card title="基本情報">
        <div className="space-y-4">
          <Field label="タイトル" htmlFor="title" required error={errors.title}>
            <Input id="title" value={title} maxLength={100} placeholder={def.placeholders.title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
          </Field>
          <Field label={lb.goal} htmlFor="goal" required error={errors.goal} hint="何を見極める／実現するための取り組みかを 1〜3 文で。AI はこれを基準に判定します。">
            <Textarea id="goal" value={goal} maxLength={2000} placeholder={def.placeholders.goal} onChange={(e) => setGoal(e.target.value)} disabled={saving} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="開始日" htmlFor="start">
              <DateField id="start" value={startDate} onChange={setStartDate} disabled={saving} />
            </Field>
            <Field label={lb.deadline} htmlFor="deadline" required error={errors.deadline}>
              <DateField id="deadline" value={deadline} min={startDate || undefined} onChange={setDeadline} disabled={saving} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title={lb.assumption}>
        <ListEditor
          idPrefix="assumption"
          itemLabel={lb.assumption}
          rows={assumptions}
          onChange={setAssumptions}
          placeholder={def.placeholders.assumption}
          extra={{ kind: "select", label: "優先度", options: PRIORITY.map((p) => ({ value: p.value, label: `優先度: ${p.label}` })), defaultValue: "medium" }}
          addLabel={`${lb.assumption}を追加`}
          disabled={saving}
        />
        {errors.assumptions && <p className="mt-2 text-xs text-rose-700" role="alert">{errors.assumptions}</p>}
      </Card>

      <Card title={lb.criterion}>
        <ListEditor
          idPrefix="criterion"
          itemLabel={lb.criterion}
          rows={criteria}
          onChange={setCriteria}
          placeholder={def.placeholders.criterion}
          extra={{ kind: "input", label: "目標値", placeholder: "目標値（任意）例: 85%" }}
          addLabel={`${lb.criterion}を追加`}
          disabled={saving}
        />
        {errors.criteria && <p className="mt-2 text-xs text-rose-700" role="alert">{errors.criteria}</p>}
      </Card>

      <Card title="メンバー">
        <MemberPicker
          members={[{ email: me.email, name: me.name, department: "", role: "owner" }, ...picked]}
          onChange={(next) => setPicked(next.filter((m) => m.role !== "owner"))}
          disabled={saving}
          isAdmin={me.is_admin}
        />
        <p className="mt-3 text-xs text-slate-500">あなた（作成者）は自動で編集者として含まれます。メンバーに入っていない人は、下で部署に公開しない限り、この取り組みを見ることができません（管理者・全体閲覧者を除く）。</p>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <DepartmentShare checked={shareDept} onChange={setShareDept} department={me.department} disabled={saving} />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/")} disabled={saving}>
          キャンセル
        </Button>
        <Button onClick={submit} disabled={saving} className={cn(saving && "cursor-wait")}>
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "作成中..." : "作成する"}
        </Button>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewProjectForm />
    </Suspense>
  );
}
