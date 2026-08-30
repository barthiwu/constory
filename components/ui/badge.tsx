import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-surface-secondary text-text-secondary border-transparent",
        blue: "bg-blue-light text-blue-hover border-transparent",
        success: "bg-success-light text-success border-transparent",
        warning: "bg-warning-light text-warning border-transparent",
        danger: "bg-danger-light text-danger border-transparent",
        outline: "bg-transparent text-text-secondary border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
