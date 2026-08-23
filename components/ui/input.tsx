import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
