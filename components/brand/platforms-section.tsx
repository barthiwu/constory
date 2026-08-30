"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PLATFORM_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { updateBrandSectionAction } from "@/app/app/(shell)/brand/actions";
import type { BrandProfile } from "@/types/database";

export function PlatformsSection({ workspaceId, brandProfile }: { workspaceId: string; brandProfile: BrandProfile | null }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>(brandProfile?.selected_platforms ?? []);
  const [saving, setSaving] = useState(false);

  function toggle(value: string) {
    setSelected((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  }

  async function handleSave() {
    if (selected.length === 0) {
      toast({ title: "Select at least one platform", variant: "error" });
      return;
    }
    setSaving(true);
    const result = await updateBrandSectionAction(workspaceId, { selected_platforms: selected });
    setSaving(false);
    if (result.error) toast({ title: "Couldn't save", description: result.error, variant: "error" });
    else toast({ title: "Platforms saved", variant: "success" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platforms</CardTitle>
        <CardDescription>Where does this brand publish content?</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PLATFORM_OPTIONS.map((p) => {
            const active = selected.includes(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => toggle(p.value)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  active ? "border-constory-blue bg-blue-light text-blue-hover" : "border-border bg-surface text-text-secondary hover:bg-surface-secondary",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <Button onClick={handleSave} loading={saving} className="justify-self-start">
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
