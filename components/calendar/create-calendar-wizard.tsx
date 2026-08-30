"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { PLATFORM_OPTIONS, GOAL_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { calendarBasicsSchema, calendarPlatformsSchema } from "@/lib/validations/calendar";
import { createCalendarAction } from "@/app/app/(shell)/calendars/actions";
import { formatDate } from "@/lib/utils";

const STEP_LABELS = ["Basics", "Platforms", "Goal", "Campaign", "Review"];

interface WizardState {
  name: string;
  start_date: string;
  end_date: string;
  posting_frequency: string;
  selected_platforms: string[];
  primary_goal: string;
  campaign_name: string;
  campaign_objective: string;
  campaign_start_date: string;
  campaign_end_date: string;
  campaign_message: string;
}

function defaultDates() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function CreateCalendarWizard({
  workspaceId,
  defaultPlatforms,
  defaultGoal,
}: {
  workspaceId: string;
  defaultPlatforms: string[];
  defaultGoal: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { start, end } = defaultDates();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    name: "",
    start_date: start,
    end_date: end,
    posting_frequency: "3",
    selected_platforms: defaultPlatforms,
    primary_goal: defaultGoal,
    campaign_name: "",
    campaign_objective: "",
    campaign_start_date: "",
    campaign_end_date: "",
    campaign_message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function togglePlatform(value: string) {
    update("selected_platforms", state.selected_platforms.includes(value) ? state.selected_platforms.filter((p) => p !== value) : [...state.selected_platforms, value]);
  }

  function goNext() {
    setErrors({});
    if (step === 0) {
      const parsed = calendarBasicsSchema.safeParse({
        name: state.name,
        start_date: state.start_date,
        end_date: state.end_date,
        posting_frequency: state.posting_frequency,
      });
      if (!parsed.success) {
        const next: Record<string, string> = {};
        parsed.error.issues.forEach((i) => (next[String(i.path[0])] = i.message));
        setErrors(next);
        return;
      }
    }
    if (step === 1) {
      const parsed = calendarPlatformsSchema.safeParse({ selected_platforms: state.selected_platforms });
      if (!parsed.success) {
        setErrors({ selected_platforms: parsed.error.issues[0]?.message ?? "Select at least one platform" });
        return;
      }
    }
    setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1));
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleCreate() {
    setSubmitting(true);
    const result = await createCalendarAction(workspaceId, {
      name: state.name,
      start_date: state.start_date,
      end_date: state.end_date,
      posting_frequency: Number(state.posting_frequency),
      selected_platforms: state.selected_platforms,
      primary_goal: state.primary_goal || null,
      campaign_name: state.campaign_name || null,
      campaign_objective: state.campaign_objective || null,
      campaign_start_date: state.campaign_start_date || null,
      campaign_end_date: state.campaign_end_date || null,
      campaign_message: state.campaign_message || null,
    });
    setSubmitting(false);
    if (result.error || !result.id) {
      toast({ title: "Couldn't create calendar", description: result.error, variant: "error" });
      return;
    }
    router.push(`/app/calendars/${result.id}?generate=1`);
  }

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">New calendar</h1>
        <p className="text-sm text-text-secondary">
          Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}
        </p>
        <Progress value={((step + 1) / STEP_LABELS.length) * 100} className="mt-3" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        {step === 0 && (
          <div className="grid gap-4">
            <FormField label="Calendar name" htmlFor="cal-name" error={errors.name} required>
              <Input id="cal-name" value={state.name} onChange={(e) => update("name", e.target.value)} placeholder="September content" />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Start date" htmlFor="cal-start" error={errors.start_date} required>
                <Input id="cal-start" type="date" value={state.start_date} onChange={(e) => update("start_date", e.target.value)} />
              </FormField>
              <FormField label="End date" htmlFor="cal-end" error={errors.end_date} required>
                <Input id="cal-end" type="date" value={state.end_date} onChange={(e) => update("end_date", e.target.value)} />
              </FormField>
            </div>
            <FormField label="Posts per week" htmlFor="cal-freq" error={errors.posting_frequency} required>
              <Input id="cal-freq" type="number" min={1} max={21} value={state.posting_frequency} onChange={(e) => update("posting_frequency", e.target.value)} className="w-32" />
            </FormField>
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="mb-3 text-sm font-medium text-text-primary">Which platforms is this calendar for?</p>
            {errors.selected_platforms && <p className="mb-2 text-sm text-danger">{errors.selected_platforms}</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PLATFORM_OPTIONS.map((p) => {
                const active = state.selected_platforms.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => togglePlatform(p.value)}
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
        )}

        {step === 2 && (
          <div>
            <p className="mb-3 text-sm font-medium text-text-primary">What&apos;s the primary goal for this calendar?</p>
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
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <p className="text-sm text-text-secondary">Optional — attach a campaign if this calendar supports one.</p>
            <FormField label="Campaign name" htmlFor="camp-name" hint="Optional">
              <Input id="camp-name" value={state.campaign_name} onChange={(e) => update("campaign_name", e.target.value)} />
            </FormField>
            <FormField label="Objective" htmlFor="camp-objective" hint="Optional">
              <Input id="camp-objective" value={state.campaign_objective} onChange={(e) => update("campaign_objective", e.target.value)} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Campaign start" htmlFor="camp-start" hint="Optional">
                <Input id="camp-start" type="date" value={state.campaign_start_date} onChange={(e) => update("campaign_start_date", e.target.value)} />
              </FormField>
              <FormField label="Campaign end" htmlFor="camp-end" hint="Optional">
                <Input id="camp-end" type="date" value={state.campaign_end_date} onChange={(e) => update("campaign_end_date", e.target.value)} />
              </FormField>
            </div>
            <FormField label="Key message" htmlFor="camp-message" hint="Optional">
              <Textarea id="camp-message" rows={3} value={state.campaign_message} onChange={(e) => update("campaign_message", e.target.value)} />
            </FormField>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4">
            <ReviewRow label="Name">{state.name}</ReviewRow>
            <ReviewRow label="Dates">
              {formatDate(state.start_date)} – {formatDate(state.end_date)}
            </ReviewRow>
            <ReviewRow label="Frequency">{state.posting_frequency} posts/week</ReviewRow>
            <ReviewRow label="Platforms">{state.selected_platforms.join(", ") || "None selected"}</ReviewRow>
            {state.primary_goal && <ReviewRow label="Goal">{GOAL_OPTIONS.find((g) => g.value === state.primary_goal)?.label}</ReviewRow>}
            {state.campaign_name && <ReviewRow label="Campaign">{state.campaign_name}</ReviewRow>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={goBack} disabled={step === 0 || submitting}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {step < STEP_LABELS.length - 1 ? (
          <Button onClick={goNext}>
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleCreate} loading={submitting}>
            <Sparkles className="h-4 w-4" />
            Generate Content Calendar
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-sm text-text-primary">{children}</p>
    </div>
  );
}
