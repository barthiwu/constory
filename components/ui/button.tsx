import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-constory-blue text-white hover:bg-blue-hover shadow-sm",
        secondary: "bg-surface text-text-primary border border-border hover:bg-surface-secondary shadow-sm",
        ghost: "bg-transparent text-text-primary hover:bg-surface-secondary",
        destructive: "bg-danger text-white hover:bg-danger/90 shadow-sm",
        "destructive-ghost": "bg-transparent text-danger hover:bg-danger-light",
        link: "text-constory-blue underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // Slot (used for `asChild`) requires exactly one React element child, so it
    // can't tolerate a sibling `{loading && <Loader2 />}` node — even one that
    // renders to `false` still counts as a second child. `asChild` consumers
    // (e.g. a Button wrapping a Link) don't use the `loading` prop anyway, so
    // only inject the spinner for the plain `<button>` case.
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
