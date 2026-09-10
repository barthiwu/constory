"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workspaceBasicsSchema, type WorkspaceBasicsInput } from "@/lib/validations/brand";
import { createWorkspaceAction } from "@/app/app/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { INDUSTRY_OPTIONS } from "@/lib/constants";

export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  // Radix's Select can't represent "not one of these options" on its own, so
  // picking "Other" swaps it out for a free-text input instead -- both are
  // bound to the same `industry` field, just one at a time.
  const [showOtherIndustry, setShowOtherIndustry] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WorkspaceBasicsInput>({ resolver: zodResolver(workspaceBasicsSchema) });

  async function onSubmit(values: WorkspaceBasicsInput) {
    setServerError(null);
    const result = await createWorkspaceAction({
      name: values.name,
      industry: values.industry || null,
      website: values.website || null,
    });
    if ("error" in result) {
      setServerError(result.error);
      return;
    }
    toast({ title: "Workspace created", variant: "success" });
    reset();
    setShowOtherIndustry(false);
    onOpenChange(false);
    router.push("/app/onboarding");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>Each workspace has its own brand, strategy, and calendars.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <FormField label="Workspace name" htmlFor="ws-name" error={errors.name?.message} required>
            <Input id="ws-name" invalid={!!errors.name} {...register("name")} />
          </FormField>
          <FormField label="Industry" htmlFor="ws-industry" error={errors.industry?.message} hint="Optional">
            {showOtherIndustry ? (
              <div className="grid gap-1.5">
                <Input id="ws-industry" invalid={!!errors.industry} placeholder="Tell us your industry" autoFocus {...register("industry")} />
                <button
                  type="button"
                  className="justify-self-start text-xs text-constory-blue hover:underline"
                  onClick={() => {
                    setShowOtherIndustry(false);
                    setValue("industry", "");
                  }}
                >
                  Choose from list instead
                </button>
              </div>
            ) : (
              <Controller
                name="industry"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => {
                      if (v === "Other") {
                        setShowOtherIndustry(true);
                        field.onChange("");
                      } else {
                        field.onChange(v);
                      }
                    }}
                  >
                    <SelectTrigger id="ws-industry">
                      <SelectValue placeholder="Select an industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRY_OPTIONS.map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FormField>
          <FormField label="Website" htmlFor="ws-website" error={errors.website?.message} hint="Optional">
            <Input id="ws-website" placeholder="yourbrand.com" invalid={!!errors.website} {...register("website")} />
          </FormField>
          {serverError && (
            <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" loading={isSubmitting}>
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
