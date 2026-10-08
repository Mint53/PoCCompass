import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = forwardRef<HTMLTextAreaElement, Props>(({ className, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    {...props}
    className={cn(
      "w-full py-2.5 leading-6 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:bg-slate-100 disabled:text-slate-500",
      className,
    )}
  />
));
Textarea.displayName = "Textarea";
export default Textarea;
