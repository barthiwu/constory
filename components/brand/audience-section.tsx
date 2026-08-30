"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { audienceSchema } from "@/lib/validations/brand";
import { updateBrandSectionAction } from "@/app/app/(shell)/brand/actions";
import type { BrandProfile } from "@/types/database";

export function AudienceSection({ workspaceId, brandProfile }: { workspaceId: string; brandProfile: BrandProfile | null }) {
  const { toast } = useToast();
  const [values, setValues] = useState({
    target_audience: brandProfile?.target_audience ?? "",
    audience_age_range: brandProfile?.audience_age_range ?? "",
    audience_locations: brandProfile?.audience_locations ?? "",
    audience_interests: brandProfile?.audience_interests ?? "",
    audience_problems: brandProfile?.audience_problems ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof values>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
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
    if (result.error) toast({ title: "Couldn't save", description: result.error, variant: "error" });
    else toast({ title: "Audience saved", variant: "success" });
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
        <Button onClick={handleSave} loading={saving} className="justify-self-start">
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
