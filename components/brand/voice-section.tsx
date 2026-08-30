"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { VOICE_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { updateBrandSectionAction } from "@/app/app/(shell)/brand/actions";
import type { BrandProfile } from "@/types/database";

function splitVoice(voice: string): { tags: string[]; custom: string } {
  const knownLabels = new Set<string>(VOICE_OPTIONS.map((v) => v.label));
  const parts = voice
    .split(/\.\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const tags = parts.filter((p) => knownLabels.has(p));
  const custom = parts.filter((p) => !knownLabels.has(p)).join(". ");
  return { tags, custom };
}

export function VoiceSection({ workspaceId, brandProfile }: { workspaceId: string; brandProfile: BrandProfile | null }) {
  const { toast } = useToast();
  const initial = splitVoice(brandProfile?.brand_voice ?? "");
  const [tags, setTags] = useState<string[]>(initial.tags.map((label) => VOICE_OPTIONS.find((v) => v.label === label)?.value ?? label));
  const [custom, setCustom] = useState(initial.custom);
  const [saving, setSaving] = useState(false);

  function toggle(value: string) {
    setTags((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]));
  }

  async function handleSave() {
    const tagLabels = tags.map((t) => VOICE_OPTIONS.find((v) => v.value === t)?.label ?? t);
    const brand_voice = [...tagLabels, custom].filter(Boolean).join(". ");
    if (!brand_voice.trim()) {
      toast({ title: "Choose or describe a brand voice", variant: "error" });
      return;
    }
    setSaving(true);
    const result = await updateBrandSectionAction(workspaceId, { brand_voice });
    setSaving(false);
    if (result.error) toast({ title: "Couldn't save", description: result.error, variant: "error" });
    else toast({ title: "Brand voice saved", variant: "success" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand voice</CardTitle>
        <CardDescription>How should your content sound?</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {VOICE_OPTIONS.map((v) => {
            const active = tags.includes(v.value);
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => toggle(v.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "border-constory-blue bg-blue-light text-blue-hover" : "border-border bg-surface text-text-secondary hover:bg-surface-secondary",
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <Textarea rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Anything else about your voice?" />
        <Button onClick={handleSave} loading={saving} className="justify-self-start">
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
