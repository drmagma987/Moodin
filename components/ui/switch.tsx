import * as React from "react";

import { cn } from "@/lib/utils";

type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, checked, ...props }, ref) => (
  <label className={cn("relative inline-flex cursor-pointer items-center", className)}>
    <input ref={ref} checked={checked} className="peer sr-only" type="checkbox" {...props} />
    <span className="h-7 w-12 rounded-full bg-white/15 transition peer-checked:bg-cyan-400" />
    <span className="absolute left-1 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
  </label>
));
Switch.displayName = "Switch";

export { Switch };
