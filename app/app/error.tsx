"use client";

import { useEffect } from "react";
import { RefreshCw, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary for the authenticated app. Catches unexpected
 * throws from server components/actions (e.g. a Supabase query failure) and
 * shows a safe, actionable message — never a raw error message, stack trace,
 * or other implementation detail.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side-only console log for debugging; nothing is sent to the UI.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-light">
        <RefreshCw className="h-6 w-6 text-danger" aria-hidden="true" />
      </div>
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold text-text-primary">Something went wrong</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          We ran into a problem loading this page. Your data is safe — try again, or head back to your dashboard.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => reset()}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button asChild>
          <a href="/app/dashboard">
            <LayoutDashboard className="h-4 w-4" />
            Go to dashboard
          </a>
        </Button>
      </div>
    </div>
  );
}
