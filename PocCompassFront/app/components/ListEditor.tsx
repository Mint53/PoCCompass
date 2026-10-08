"use client";

import { Plus, Trash2 } from "lucide-react";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Select from "./ui/Select";

export type ListRow = { text: string; extra: string };

/**
 * Editable list of short texts with one extra column (priority select or target input).
 * Used for assumptions / criteria in the create form.
 */
export default function ListEditor({
  idPrefix,
  itemLabel,
  rows,
  onChange,
  placeholder,
  extra,
  addLabel,
  disabled,
}: {
  idPrefix: string;
  /** accessible name of each row, e.g. 「仮説」 -> 「仮説 1」 */
  itemLabel: string;
  rows: ListRow[];
  onChange: (rows: ListRow[]) => void;
  placeholder: string;
  extra: { kind: "select"; label: string; options: readonly { value: string; label: string }[]; defaultValue: string } | { kind: "input"; label: string; placeholder: string };
  addLabel: string;
  disabled?: boolean;
}) {
  const update = (i: number, patch: Partial<ListRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id={i === 0 ? idPrefix : `${idPrefix}-${i}`}
            aria-label={`${itemLabel} ${i + 1}`}
            value={r.text}
            placeholder={placeholder}
            maxLength={1000}
            onChange={(e) => update(i, { text: e.target.value })}
            disabled={disabled}
          />
          <div className="flex items-center gap-2 sm:w-56 sm:shrink-0">
            {extra.kind === "select" ? (
              <Select
                aria-label={extra.label}
                value={r.extra}
                options={[...extra.options]}
                onChange={(e) => update(i, { extra: e.target.value })}
                disabled={disabled}
              />
            ) : (
              <Input
                aria-label={extra.label}
                value={r.extra}
                placeholder={extra.placeholder}
                maxLength={200}
                onChange={(e) => update(i, { extra: e.target.value })}
                disabled={disabled}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${i + 1} 行目を削除`}
              title="削除"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              disabled={disabled || rows.length <= 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { text: "", extra: extra.kind === "select" ? extra.defaultValue : "" }])}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}
