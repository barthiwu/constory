"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (opts: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VARIANT_ICON: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const VARIANT_COLOR: Record<ToastVariant, string> = {
  success: "text-success",
  error: "text-danger",
  warning: "text-warning",
  info: "text-constory-blue",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback<ToastContextValue["toast"]>(({ title, description, variant = "info" }) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, title, description, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => {
          const Icon = VARIANT_ICON[item.variant];
          return (
            <ToastPrimitive.Root
              key={item.id}
              className={cn(
                "grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-lg",
                "data-[state=open]:animate-fade-in data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
              )}
              onOpenChange={(open) => {
                if (!open) setItems((prev) => prev.filter((t) => t.id !== item.id));
              }}
            >
              <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", VARIANT_COLOR[item.variant])} aria-hidden="true" />
              <div className="grid gap-1">
                <ToastPrimitive.Title className="text-sm font-medium text-text-primary">
                  {item.title}
                </ToastPrimitive.Title>
                {item.description && (
                  <ToastPrimitive.Description className="text-sm text-text-secondary">
                    {item.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close className="text-text-muted hover:text-text-primary" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] m-0 flex w-full max-w-sm flex-col gap-2 p-6 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
