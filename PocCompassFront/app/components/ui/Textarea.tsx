import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = forwardRef<HTMLTextAreaElement, Props>(({ className, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    {...props}
    className={cn(
      "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-slate-100",
      className,
    )}
  />
));
Textarea.displayName = "Textarea";
export default Textarea;
