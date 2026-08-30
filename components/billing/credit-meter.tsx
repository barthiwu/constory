import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// credit_balances.period_end is a full timestamptz ISO string, not the plain
// YYYY-MM-DD dates lib/utils.ts's formatDate() expects — format it directly.
function formatResetDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface CreditMeterProps {
  used: number;
  allocation: number;
  resetDate: string;
  className?: string;
  compact?: boolean;
}

/**
 * Shared AI-credit display (spec §32: "42 / 85 remaining, Resets Sep 15").
 * Used on the dashboard (compact) and the billing page (full) — deliberately
 * not embedded into every single AI trigger button, per the spec's "don't
 * overwhelm every screen with credit counters."
 */
export function CreditMeter({ used, allocation, resetDate, className, compact = false }: CreditMeterProps) {
  const remaining = Math.max(allocation - used, 0);
  const pct = allocation > 0 ? Math.min(100, Math.round((used / allocation) * 100)) : 0;
  const low = allocation > 0 && remaining / allocation <= 0.15;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm", className)}>
        <Zap className={cn("h-4 w-4 shrink-0", low ? "text-warning" : "text-constory-blue")} aria-hidden="true" />
        <span className="text-text-primary">
          <span className="font-medium">{remaining}</span> / {allocation} AI credits left
        </span>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-text-primary">AI Credits</span>
        <span className="text-text-secondary">
          {remaining} / {allocation} remaining
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
        <div
          className={cn("h-full rounded-full transition-all", low ? "bg-warning" : "bg-constory-blue")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-text-muted">Resets {formatResetDate(resetDate)}</p>
    </div>
  );
}
