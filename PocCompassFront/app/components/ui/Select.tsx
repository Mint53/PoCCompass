import React from "react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };
type Props = React.SelectHTMLAttributes<HTMLSelectElement> & { options: Option[] };

export default function Select({ options, className, ...props }: Props) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-slate-100",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
