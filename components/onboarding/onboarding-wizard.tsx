"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import {
  workspaceBasicsSchema,
  businessDescriptionSchema,
  audienceSchema,
  goalsSchema,
  brandVoiceSchema,
  platformsSchema,
} from "@/lib/validations/brand";
import { startOnboardingAction, completeOnboardingAction, type OnboardingCompletionInput } from "@/app/app/onboarding/actions";
import {
  StepWorkspace,
  StepBusiness,
  StepProducts,
  StepAudience,
  StepGoals,
  StepVoice,
  StepPlatforms,
  StepReview,
  type ProductDraft,
} from "@/components/onboarding/steps";

const STEP_LABELS = [
  "Workspace",
  "Business",
  "Products & services",
  "Audience",
  "Goals",
  "Brand voice",
  "Platforms",
  "Review",
];

export interface OnboardingState {
  name: string;
  industry: string;
  website: string;
  business_description: string;
  products: ProductDraft[];
  target_audience: string;
  audience_age_range: string;
  audience_locations: string;
  audience_interests: string;
  audience_problems: string;
  primary_goal: string;
  secondary_goals: string[];
  brand_voice_tags: string[];
  brand_voice_custom: string;
  selected_platforms: string[];
}

const INITIAL_STATE: OnboardingState = {
  name: "",
  industry: "",
  website: "",
  business_description: "",
  products: [],
  target_audience: "",
  audience_age_range: "",
  audience_locations: "",
  audience_interests: "",
  audience_problems: "",
  primary_goal: "",
  secondary_goals: [],
  brand_voice_tags: [],
  brand_voice_custom: "",
  selected_platforms: [],
};

export function OnboardingWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(INITIAL_STATE);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  async function goNext() {
    setErrors({});

    if (step === 0) {
      const parsed = workspaceBasicsSchema.safeParse({ name: state.name, industry: state.industry, website: state.website });
      if (!parsed.success) return setFieldErrors(parsed);
      setIsSubmitting(true);
      const result = await startOnboardingAction(
        { name: parsed.data.name, industry: parsed.data.industry, website: parsed.data.website },
        workspaceId ?? undefined,
      );
      setIsSubmitting(false);
      if ("error" in result) return toast({ title: "Couldn't save", description: result.error, variant: "error" });
      setWorkspaceId(result.workspaceId);
      return setStep(1);
    }

    if (step === 1) {
      const parsed = businessDescriptionSchema.safeParse({ business_description: state.business_description });
      if (!parsed.success) return setFieldErrors(parsed);
      return setStep(2);
    }

    if (step === 2) {
      // Products are optional — no hard validation, just move on.
      return setStep(3);
    }

    if (step === 3) {
      const parsed = audienceSchema.safeParse({
        target_audience: state.target_audience,
        audience_age_range: state.audience_age_range,
        audience_locations: state.audience_locations,
        audience_interests: state.audience_interests,
        audience_problems: state.audience_problems,
      });
      if (!parsed.success) return setFieldErrors(parsed);
      return setStep(4);
    }

    if (step === 4) {
      const parsed = goalsSchema.safeParse({ primary_goal: state.primary_goal, secondary_goals: state.secondary_goals });
      if (!parsed.success) return setFieldErrors(parsed);
      return setStep(5);
    }

    if (step === 5) {
      const brand_voice = [...state.brand_voice_tags, state.brand_voice_custom].filter(Boolean).join(". ");
      const parsed = brandVoiceSchema.safeParse({ brand_voice });
      if (!parsed.success) return setFieldErrors(parsed);
      return setStep(6);
    }

    if (step === 6) {
      const parsed = platformsSchema.safeParse({ selected_platforms: state.selected_platforms });
      if (!parsed.success) return setFieldErrors(parsed);
      return setStep(7);
    }
  }

  function setFieldErrors(parsed: { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
    const next: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      next[String(issue.path[0])] = issue.message;
    });
    setErrors(next);
  }

  async function handleFinish() {
    if (!workspaceId) return;
    setIsSubmitting(true);
    const payload: OnboardingCompletionInput = {
      business_description: state.business_description,
      products: state.products.map((p) => ({ name: p.name, description: p.description, category: p.category })),
      target_audience: state.target_audience,
      audience_age_range: state.audience_age_range,
      audience_locations: state.audience_locations,
      audience_interests: state.audience_interests,
      audience_problems: state.audience_problems,
      primary_goal: state.primary_goal,
      secondary_goals: state.secondary_goals,
      brand_voice: [...state.brand_voice_tags, state.brand_voice_custom].filter(Boolean).join(". "),
      selected_platforms: state.selected_platforms,
    };

    const result = await completeOnboardingAction(workspaceId, payload);
    setIsSubmitting(false);

    if (!result.ok) {
      toast({ title: "Couldn't finish onboarding", description: result.error, variant: "error" });
      return;
    }
    if (!result.strategyGenerated) {
      toast({
        title: "Brand saved",
        description: result.error ?? "We couldn't generate your strategy automatically — you can generate it from the Strategy page.",
        variant: "warning",
      });
    } else {
      toast({ title: "Your strategy is ready", variant: "success" });
    }
    router.push("/app/strategy");
    router.refresh();
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>
            Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}
          </span>
          <span>{Math.round(((step + 1) / STEP_LABELS.length) * 100)}%</span>
        </div>
        <Progress value={((step + 1) / STEP_LABELS.length) * 100} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        {step === 0 && <StepWorkspace state={state} update={update} errors={errors} />}
        {step === 1 && <StepBusiness state={state} update={update} errors={errors} />}
        {step === 2 && <StepProducts state={state} update={update} />}
        {step === 3 && <StepAudience state={state} update={update} errors={errors} />}
        {step === 4 && <StepGoals state={state} update={update} errors={errors} />}
        {step === 5 && <StepVoice state={state} update={update} errors={errors} />}
        {step === 6 && <StepPlatforms state={state} update={update} errors={errors} />}
        {step === 7 && <StepReview state={state} />}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={goBack} disabled={step === 0 || isSubmitting}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {step < 7 ? (
          <Button onClick={goNext} loading={isSubmitting}>
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleFinish} loading={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building your strategy...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Build My Strategy
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
