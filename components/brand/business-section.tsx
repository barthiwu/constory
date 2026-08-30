"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { businessDescriptionSchema } from "@/lib/validations/brand";
import { updateBrandSectionAction } from "@/app/app/(shell)/brand/actions";
import type { BrandProfile } from "@/types/database";

export function BusinessSection({ workspaceId, brandProfile }: { workspaceId: string; brandProfile: BrandProfile | null }) {
  const { toast } = useToast();
  const [value, setValue] = useState(brandProfile?.business_description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsed = businessDescriptionSchema.safeParse({ business_description: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setError(null);
    setSaving(true);
    const result = await updateBrandSectionAction(workspaceId, { business_description: parsed.data.business_description });
    setSaving(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
    } else {
      toast({ title: "Business description saved", variant: "success" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What does your business do?</CardTitle>
        <CardDescription>This grounds every AI generation in what your business actually does.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormField label="Business description" htmlFor="business-description" error={error ?? undefined}>
          <Textarea id="business-description" rows={8} value={value} onChange={(e) => setValue(e.target.value)} />
        </FormField>
        <Button onClick={handleSave} loading={saving} className="justify-self-start">
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
