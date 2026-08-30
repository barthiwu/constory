import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Human-readable, actionable error surface. Use for any failure the user can
 * recover from (failed AI generation, a save that didn't go through, etc.) —
 * never a raw error message or stack trace.
 */
export function ErrorState({ title = "Something went wrong", message, onRetry, retryLabel = "Try again", className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-danger/20 bg-danger-light px-6 py-10 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
      <div className="grid gap-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="max-w-sm text-sm text-text-secondary">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
