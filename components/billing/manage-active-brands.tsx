"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setActiveWorkspacesAction } from "@/app/app/(shell)/settings/billing/actions";

interface WorkspaceRow {
  id: string;
  name: string;
  billing_locked: boolean;
}

/**
 * Downgrade grace handling (spec §27-28): shown only when the account owns
 * more brands than the current plan allows. Nothing here is ever deleted —
 * this only toggles which brands are active (unlocked) vs. locked
 * (read-only, no new content) until the owner either upgrades again or picks
 * a different set to keep active.
 */
export function ManageActiveBrands({ workspaces, limit }: { workspaces: WorkspaceRow[]; limit: number }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(workspaces.filter((w) => !w.billing_locked).map((w) => w.id)));
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await setActiveWorkspacesAction(Array.from(selected));
      if (result.error) {
        toast({ title: "Couldn't update active brands", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Active brands updated", variant: "success" });
    });
  }

  const overLimit = selected.size > limit;

  return (
    <div className="grid gap-4 rounded-lg border border-warning bg-warning-light p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-text-primary">Your plan allows {limit} active brand{limit === 1 ? "" : "s"}</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            You own {workspaces.length}. Select which {limit === 1 ? "one stays" : `${limit} stay`} active — the rest are kept exactly as they are,
            just locked to new content, until you upgrade or change your selection.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        {workspaces.map((w) => (
          <label key={w.id} className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm">
            <Checkbox checked={selected.has(w.id)} onCheckedChange={() => toggle(w.id)} />
            <span className="flex-1 text-text-primary">{w.name}</span>
            {!selected.has(w.id) && <span className="text-xs text-text-muted">Locked</span>}
          </label>
        ))}
      </div>

      {overLimit && (
        <p role="alert" className="text-sm text-danger">
          You&rsquo;ve selected {selected.size}, but your plan allows {limit}. Unselect {selected.size - limit} more.
        </p>
      )}

      <Button size="sm" onClick={handleSave} loading={isPending} disabled={overLimit || selected.size === 0} className="justify-self-start">
        Save active brands
      </Button>
    </div>
  );
}
