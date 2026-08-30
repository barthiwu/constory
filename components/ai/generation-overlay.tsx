"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

/**
 * Shows a sequence of progress-stage labels while an AI generation request is
 * in flight (spec section 28) — never a frozen blank screen. Stages advance
 * on a timer up to the second-to-last one, then hold there until `active`
 * turns false, so the UI never claims to be further along than it knows.
 */
export function GenerationOverlay({ active, stages, title = "Working on it..." }: { active: boolean; stages: string[]; title?: string }) {
  const [index, setIndex] = useState(0);
  // Reset the stage index when `active` flips off, using React's "adjust
  // state during render" pattern (see https://react.dev/learn/you-might-not-need-an-effect)
  // rather than an effect, so the reset happens synchronously with the
  // prop change instead of one render later.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) setIndex(0);
  }

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setIndex((i) => Math.min(i + 1, stages.length - 1));
    }, 1400);
    return () => clearInterval(interval);
  }, [active, stages.length]);

  return (
    <Dialog open={active}>
      <DialogContent hideClose className="sm:max-w-sm text-center" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-light">
            <Sparkles className="h-6 w-6 animate-pulse text-constory-blue" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-text-primary" aria-live="polite">
            {stages[index]}
          </p>
          <Progress value={((index + 1) / stages.length) * 100} className="w-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
