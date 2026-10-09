"use client";

import { cn } from "@/lib/utils";

/** "Share with my department (read-only)" switch for a project (SPEC §9). `department` is the owner's department from the user master. */
export default function DepartmentShare({
  checked,
  onChange,
  department,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  department: string;
  disabled?: boolean;
}) {
  const blocked = !department && !checked;
  return (
    <div className="space-y-1.5">
      <label className={cn("flex items-start gap-3 text-sm", disabled || blocked ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
          checked={checked}
          disabled={disabled || blocked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className="block font-semibold text-slate-900">
            {department ? `同じ部署（${department}）の人に公開する（閲覧のみ）` : "同じ部署の人に公開する（閲覧のみ）"}
          </span>
          <span className="block text-xs text-slate-500">
            {department
              ? "ユーザーマスタの部署が同じ人は、メンバーに入れなくても一覧に出て閲覧できます。編集はメンバーだけです。"
              : "作成者の部署がユーザーマスタに登録されていないため選べません。管理者に部署の登録を依頼してください。"}
          </span>
        </span>
      </label>
    </div>
  );
}
