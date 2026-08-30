import { Info } from "lucide-react";
import { getPostQualitySignals } from "@/lib/intelligence/quality-signals";
import type { CalendarPost } from "@/types/database";

/**
 * Small, understated list of what's still missing before this post is ready
 * to publish — neutral completeness notes, not errors. Renders nothing when
 * the post is fully filled in.
 */
export function QualitySignals({ post }: { post: CalendarPost }) {
  const signals = getPostQualitySignals(post);
  if (signals.length === 0) return null;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-secondary p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        Before this is ready
      </div>
      <ul className="grid gap-1">
        {signals.map((signal) => (
          <li key={signal} className="flex items-start gap-2 text-xs text-text-muted">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" aria-hidden="true" />
            {signal}
          </li>
        ))}
      </ul>
    </div>
  );
}
