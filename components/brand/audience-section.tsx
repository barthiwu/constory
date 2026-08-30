"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { audienceSchema } from "@/lib/validations/brand";
import { updateBrandSectionAction } from "@/app/app/(shell)/brand/actions";
import type { BrandProfile } from "@/types/database";

export function AudienceSection({ workspaceId, brandProfile }: { workspaceId: string; brandProfile: BrandProfile | null }) {
  const { toast } = useToast();
  const [values, setValues] = useState({
    target_audience: brandProfile?.target_audience ?? "",
    audience_type: brandProfile?.audience_type ?? "",
    audience_age_range: brandProfile?.audience_age_range ?? "",
    audience_locations: brandProfile?.audience_locations ?? "",
    audience_interests: brandProfile?.audience_interests ?? "",
    audience_problems: brandProfile?.audience_problems ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  function set<K extends keyof typeof values>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
  }

  async function handleSave() {
    const parsed = audienceSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (next[String(i.path[0])] = i.message));
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    const result = await updateBrandSectionAction(workspaceId, parsed.data);
    setSaving(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
    } else {
      setDirty(false);
      toast({ title: "Audience saved", variant: "success" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who is your target audience?</CardTitle>
        <CardDescription>Constory uses this to keep content relevant to real people.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormField label="Target audience" htmlFor="audience" error={errors.target_audience}>
          <Textarea id="audience" rows={3} value={values.target_audience} onChange={(e) => set("target_audience", e.target.value)} />
        </FormField>
        <FormField label="Audience type" htmlFor="audience-type" hint="Optional — e.g. B2B, B2C, both">
          <Input id="audience-type" value={values.audience_type} onChange={(e) => set("audience_type", e.target.value)} placeholder="e.g. B2C" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Age range" htmlFor="age-range">
            <Input id="age-range" value={values.audience_age_range} onChange={(e) => set("audience_age_range", e.target.value)} />
          </FormField>
          <FormField label="Locations" htmlFor="locations">
            <Input id="locations" value={values.audience_locations} onChange={(e) => set("audience_locations", e.target.value)} />
          </FormField>
        </div>
        <FormField label="Interests" htmlFor="interests">
          <Textarea id="interests" rows={2} value={values.audience_interests} onChange={(e) => set("audience_interests", e.target.value)} />
        </FormField>
        <FormField label="Challenges / problems" htmlFor="problems">
          <Textarea id="problems" rows={2} value={values.audience_problems} onChange={(e) => set("audience_problems", e.target.value)} />
        </FormField>
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
