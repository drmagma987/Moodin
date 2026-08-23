import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-sm font-medium transition outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-cyan-400 text-slate-950 shadow-[0_12px_30px_rgba(34,211,238,0.22)]",
        secondary: "bg-white/10 text-slate-100",
        ghost: "bg-transparent text-slate-200",
        destructive: "bg-rose-500/85 text-white",
        outline: "border border-white/10 bg-white/5 text-slate-100",
      },
      size: {
        default: "px-4 py-3",
        lg: "px-4 py-4 text-base",
        sm: "px-3 py-2 text-xs",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      type={type}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
