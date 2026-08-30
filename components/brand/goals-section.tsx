"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { GOAL_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { updateBrandSectionAction } from "@/app/app/(shell)/brand/actions";
import type { BrandProfile } from "@/types/database";

export function GoalsSection({ workspaceId, brandProfile }: { workspaceId: string; brandProfile: BrandProfile | null }) {
  const { toast } = useToast();
  const [primaryGoal, setPrimaryGoal] = useState(brandProfile?.primary_goal ?? "");
  const [secondaryGoals, setSecondaryGoals] = useState<string[]>(brandProfile?.secondary_goals ?? []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  function toggleSecondary(value: string) {
    setSecondaryGoals((prev) => (prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]));
    setDirty(true);
  }

  async function handleSave() {
    if (!primaryGoal) {
      toast({ title: "Choose a primary goal", variant: "error" });
      return;
    }
    setSaving(true);
    const result = await updateBrandSectionAction(workspaceId, { primary_goal: primaryGoal, secondary_goals: secondaryGoals });
    setSaving(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
    } else {
      setDirty(false);
      toast({ title: "Goals saved", variant: "success" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business goals</CardTitle>
        <CardDescription>What should your content ultimately drive?</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-sm font-medium text-text-primary">Primary goal</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GOAL_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => {
                  setPrimaryGoal(g.value);
                  setDirty(true);
                }}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  primaryGoal === g.value
                    ? "border-constory-blue bg-blue-light text-blue-hover"
                    : "border-border bg-surface text-text-secondary hover:bg-surface-secondary",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium text-text-primary">Secondary goals</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {GOAL_OPTIONS.filter((g) => g.value !== primaryGoal).map((g) => (
              <label key={g.value} className="flex items-center gap-2 text-sm text-text-secondary">
                <Checkbox checked={secondaryGoals.includes(g.value)} onCheckedChange={() => toggleSecondary(g.value)} />
                {g.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} loading={saving} disabled={!dirty} className="justify-self-start">
            Save changes
          </Button>
          {dirty && !saving && <span className="text-xs text-text-muted">Unsaved changes</span>}
        </div>
      </CardContent>
    </Card>
  );
}
