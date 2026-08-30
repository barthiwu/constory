"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { FormField } from "@/components/layout/form-field";
import { GOAL_OPTIONS, VOICE_OPTIONS, PLATFORM_OPTIONS, goalLabel, platformLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { createProductAction, updateProductAction, deleteProductAction } from "@/app/app/(shell)/brand/actions";
import type { OnboardingState } from "@/components/onboarding/onboarding-wizard";
import type { ProductService } from "@/types/database";

interface StepProps {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
  errors?: Record<string, string>;
}

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 grid gap-1">
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary">{description}</p>
    </div>
  );
}

export function StepWorkspace({ state, update, errors }: StepProps) {
  return (
    <div>
      <StepHeading title="Let's set up your workspace" description="This is where your brand's strategy and content will live." />
      <div className="grid gap-4">
        <FormField label="Brand or workspace name" htmlFor="ob-name" error={errors?.name} required>
          <Input id="ob-name" value={state.name} onChange={(e) => update("name", e.target.value)} placeholder="Acme Studio" />
        </FormField>
        <FormField label="Industry" htmlFor="ob-industry" error={errors?.industry} hint="Optional">
          <Input id="ob-industry" value={state.industry} onChange={(e) => update("industry", e.target.value)} placeholder="e.g. Skincare, SaaS, Coaching" />
        </FormField>
        <FormField label="Website" htmlFor="ob-website" error={errors?.website} hint="Optional">
          <Input id="ob-website" value={state.website} onChange={(e) => update("website", e.target.value)} placeholder="yourbrand.com" />
        </FormField>
      </div>
    </div>
  );
}

export function StepBusiness({ state, update, errors }: StepProps) {
  return (
    <div>
      <StepHeading title="What does your business do?" description="The more specific you are, the better Constory can plan for you." />
      <FormField label="Business description" htmlFor="ob-desc" error={errors?.business_description} required>
        <Textarea
          id="ob-desc"
          rows={8}
          value={state.business_description}
          onChange={(e) => update("business_description", e.target.value)}
          placeholder="We help independent bakers turn their home kitchens into online storefronts..."
        />
      </FormField>
    </div>
  );
}

const EMPTY_PRODUCT_DRAFT = { name: "", description: "", category: "" };

interface StepProductsProps {
  workspaceId: string;
  products: ProductService[];
  onChange: (products: ProductService[]) => void;
}

/**
 * Products persist immediately against the database (with stable, server-issued
 * ids) as the user adds, edits, or removes them — rather than living only in
 * local wizard state until a final batch save. This is what makes resuming
 * onboarding, and re-saving after a resume, idempotent: there is no "replay the
 * whole list" step that could ever recreate a product that already exists.
 */
export function StepProducts({ workspaceId, products, onChange }: StepProductsProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(EMPTY_PRODUCT_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function cancelEdit() {
    setEditingId(null);
    setDraft(EMPTY_PRODUCT_DRAFT);
  }

  async function saveDraft() {
    if (!draft.name.trim()) return;
    setBusy(true);

    if (editingId === null) {
      const result = await createProductAction(workspaceId, draft);
      setBusy(false);
      if ("error" in result) {
        toast({ title: "Couldn't add", description: result.error, variant: "error" });
        return;
      }
      onChange([...products, result.product]);
    } else {
      const result = await updateProductAction(editingId, draft);
      setBusy(false);
      if ("error" in result) {
        toast({ title: "Couldn't save", description: result.error, variant: "error" });
        return;
      }
      onChange(products.map((p) => (p.id === editingId ? result.product : p)));
    }
    cancelEdit();
  }

  function startEdit(product: ProductService) {
    setEditingId(product.id);
    setDraft({ name: product.name, description: product.description, category: product.category ?? "" });
  }

  async function removeProduct(id: string) {
    setBusy(true);
    const result = await deleteProductAction(id);
    setBusy(false);
    if ("error" in result) {
      toast({ title: "Couldn't remove", description: result.error, variant: "error" });
      return;
    }
    onChange(products.filter((p) => p.id !== id));
    if (editingId === id) cancelEdit();
  }

  return (
    <div>
      <StepHeading title="Products & services" description="Add what you offer — Constory uses this to ground content in what you actually sell." />
      <div className="grid gap-3">
        {products.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex items-start justify-between gap-3 rounded-md border bg-app-background p-3",
              editingId === p.id ? "border-constory-blue" : "border-border",
            )}
          >
            <div className="grid gap-0.5">
              <p className="text-sm font-medium text-text-primary">{p.name}</p>
              {p.description && <p className="text-sm text-text-secondary">{p.description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`} disabled={busy}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => removeProduct(p.id)} aria-label={`Remove ${p.name}`} disabled={busy}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          </div>
        ))}

        <div className="grid gap-3 rounded-md border border-dashed border-border p-4">
          {editingId !== null && (
            <p className="text-xs font-medium text-constory-blue">
              Editing &ldquo;{products.find((p) => p.id === editingId)?.name}&rdquo;
            </p>
          )}
          <Input placeholder="Product or service name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Textarea
            placeholder="Short description (optional)"
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={saveDraft} disabled={!draft.name.trim() || busy} loading={busy} className="justify-self-start">
              {editingId === null ? (
                <>
                  <Plus className="h-4 w-4" />
                  Add another
                </>
              ) : (
                "Save changes"
              )}
            </Button>
            {editingId !== null && (
              <Button type="button" variant="ghost" onClick={cancelEdit} disabled={busy}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StepAudience({ state, update, errors }: StepProps) {
  return (
    <div>
      <StepHeading title="Who are you creating content for?" description="Describe your audience so content actually speaks to them." />
      <div className="grid gap-4">
        <FormField label="Target audience" htmlFor="ob-audience" error={errors?.target_audience} required>
          <Textarea
            id="ob-audience"
            rows={3}
            value={state.target_audience}
            onChange={(e) => update("target_audience", e.target.value)}
            placeholder="Busy home bakers who want to turn a hobby into a side income..."
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Age range" htmlFor="ob-age" hint="Optional">
            <Input id="ob-age" value={state.audience_age_range} onChange={(e) => update("audience_age_range", e.target.value)} placeholder="25–40" />
          </FormField>
          <FormField label="Locations" htmlFor="ob-locations" hint="Optional">
            <Input id="ob-locations" value={state.audience_locations} onChange={(e) => update("audience_locations", e.target.value)} placeholder="US, UK, Canada" />
          </FormField>
        </div>
        <FormField label="Interests" htmlFor="ob-interests" hint="Optional">
          <Textarea id="ob-interests" rows={2} value={state.audience_interests} onChange={(e) => update("audience_interests", e.target.value)} />
        </FormField>
        <FormField label="Challenges / problems they face" htmlFor="ob-problems" hint="Optional">
          <Textarea id="ob-problems" rows={2} value={state.audience_problems} onChange={(e) => update("audience_problems", e.target.value)} />
        </FormField>
      </div>
    </div>
  );
}

export function StepGoals({ state, update, errors }: StepProps) {
  function toggleSecondary(value: string) {
    const has = state.secondary_goals.includes(value);
    update("secondary_goals", has ? state.secondary_goals.filter((g) => g !== value) : [...state.secondary_goals, value]);
  }

  return (
    <div>
      <StepHeading title="What are your goals?" description="Choose the outcome your content should primarily drive." />
      <div className="grid gap-6">
        <FormField label="Primary goal" htmlFor="ob-goal" error={errors?.primary_goal} required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GOAL_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => update("primary_goal", g.value)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  state.primary_goal === g.value
                    ? "border-constory-blue bg-blue-light text-blue-hover"
                    : "border-border bg-surface text-text-secondary hover:bg-surface-secondary",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </FormField>

        <div className="grid gap-2">
          <p className="text-sm font-medium text-text-primary">Secondary goals (optional)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {GOAL_OPTIONS.filter((g) => g.value !== state.primary_goal).map((g) => (
              <label key={g.value} className="flex items-center gap-2 text-sm text-text-secondary">
                <Checkbox checked={state.secondary_goals.includes(g.value)} onCheckedChange={() => toggleSecondary(g.value)} />
                {g.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StepVoice({ state, update, errors }: StepProps) {
  function toggleTag(value: string) {
    const has = state.brand_voice_tags.includes(value);
    update("brand_voice_tags", has ? state.brand_voice_tags.filter((t) => t !== value) : [...state.brand_voice_tags, value]);
  }

  return (
    <div>
      <StepHeading title="What's your brand voice?" description="Select what fits, and add anything specific in your own words." />
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {VOICE_OPTIONS.map((v) => {
            const active = state.brand_voice_tags.includes(v.value);
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => toggleTag(v.value)}
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
        <FormField label="Anything else about your voice?" htmlFor="ob-voice-custom" error={errors?.brand_voice} hint="Optional, but helpful">
          <Textarea
            id="ob-voice-custom"
            rows={3}
            value={state.brand_voice_custom}
            onChange={(e) => update("brand_voice_custom", e.target.value)}
            placeholder="Warm but no-nonsense. We avoid corporate jargon."
          />
        </FormField>
      </div>
    </div>
  );
}

export function StepPlatforms({ state, update, errors }: StepProps) {
  function toggle(value: string) {
    const has = state.selected_platforms.includes(value);
    update("selected_platforms", has ? state.selected_platforms.filter((p) => p !== value) : [...state.selected_platforms, value]);
  }

  return (
    <div>
      <StepHeading title="Where do you publish?" description="Select every platform Constory should plan content for." />
      {errors?.selected_platforms && <p className="mb-3 text-sm text-danger">{errors.selected_platforms}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PLATFORM_OPTIONS.map((p) => {
          const active = state.selected_platforms.includes(p.value);
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
    </div>
  );
}

export function StepReview({ state }: { state: OnboardingState }) {
  const voice = [...state.brand_voice_tags, state.brand_voice_custom].filter(Boolean).join(", ");

  return (
    <div>
      <StepHeading title="Review your brand" description="Here's what Constory will use to build your strategy." />
      <div className="grid gap-5">
        <ReviewRow label="Workspace">{state.name}{state.industry ? ` · ${state.industry}` : ""}</ReviewRow>
        <ReviewRow label="Business">{state.business_description}</ReviewRow>
        {state.products.length > 0 && (
          <ReviewRow label="Products & services">{state.products.map((p) => p.name).join(", ")}</ReviewRow>
        )}
        <ReviewRow label="Audience">{state.target_audience}</ReviewRow>
        <ReviewRow label="Goals">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="blue">{goalLabel(state.primary_goal)}</Badge>
            {state.secondary_goals.map((g) => (
              <Badge key={g}>{goalLabel(g)}</Badge>
            ))}
          </div>
        </ReviewRow>
        <ReviewRow label="Brand voice">{voice}</ReviewRow>
        <ReviewRow label="Platforms">
          <div className="flex flex-wrap gap-1.5">
            {state.selected_platforms.map((p) => (
              <Badge key={p}>{platformLabel(p)}</Badge>
            ))}
          </div>
        </ReviewRow>
      </div>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border pb-4 last:border-0 last:pb-0">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  );
}
