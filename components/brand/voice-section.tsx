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

/**
 * Before the brand_voice_traits column existed, preset traits and the custom
 * description were flattened into one `brand_voice` string. This is a
 * read-only, one-time fallback so a workspace that saved voice data before
 * the migration still sees its preset traits pre-selected the first time
 * this section loads — it never writes in this shape again; saving always
 * persists brand_voice_traits/brand_voice as separate fields from here on.
 */
function legacyFallbackTraits(voice: string): { tags: string[]; custom: string } {
  const knownLabels = new Set<string>(VOICE_OPTIONS.map((v) => v.label));
  const parts = voice.split(/\.\s*/).map((p) => p.trim()).filter(Boolean);
  const tags = parts.filter((p) => knownLabels.has(p));
  const custom = parts.filter((p) => !knownLabels.has(p)).join(". ");
  return { tags, custom };
}

export function VoiceSection({ workspaceId, brandProfile }: { workspaceId: string; brandProfile: BrandProfile | null }) {
  const { toast } = useToast();
  const hasStructuredData = (brandProfile?.brand_voice_traits.length ?? 0) > 0;
  const legacy = !hasStructuredData && brandProfile?.brand_voice ? legacyFallbackTraits(brandProfile.brand_voice) : null;

  const [tags, setTags] = useState<string[]>(
    hasStructuredData
      ? (brandProfile?.brand_voice_traits ?? [])
      : (legacy?.tags.map((label) => VOICE_OPTIONS.find((v) => v.label === label)?.value ?? label) ?? []),
  );
  const [custom, setCustom] = useState(hasStructuredData ? (brandProfile?.brand_voice ?? "") : (legacy?.custom ?? brandProfile?.brand_voice ?? ""));
  const [saving, setSaving] = useState(false);

  function toggle(value: string) {
    setTags((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]));
  }

  async function handleSave() {
    if (tags.length === 0 && !custom.trim()) {
      toast({ title: "Choose or describe a brand voice", variant: "error" });
      return;
    }
    setSaving(true);
    const result = await updateBrandSectionAction(workspaceId, { brand_voice_traits: tags, brand_voice: custom.trim() });
    setSaving(false);
    if (result.error) toast({ title: "Couldn't save", description: result.error, variant: "error" });
    else toast({ title: "Brand voice saved", variant: "success" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand voice</CardTitle>
        <CardDescription>How should your content sound? Select the traits that fit, and add anything specific in your own words.</CardDescription>
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
        <div className="grid gap-1.5">
          <label htmlFor="voice-custom-description" className="text-sm font-medium text-text-primary">
            Custom description
          </label>
          <Textarea
            id="voice-custom-description"
            rows={3}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Anything else about your voice? e.g. Clear, confident and approachable."
          />
        </div>
        <Button onClick={handleSave} loading={saving} className="justify-self-start">
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
