import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium", {
  variants: {
    variant: {
      default: "bg-white/8 text-slate-200",
      cyan: "bg-cyan-400/12 text-cyan-100",
      success: "bg-emerald-400/12 text-emerald-100",
      warning: "bg-amber-400/12 text-amber-100",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
