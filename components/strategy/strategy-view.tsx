"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { useToast } from "@/components/ui/toast";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { GenerationOverlay } from "@/components/ai/generation-overlay";
import { STRATEGY_STAGES } from "@/lib/ai/stages";
import { PillarCard } from "@/components/strategy/pillar-card";
import { ContentMixBar } from "@/components/strategy/content-mix-bar";
import { createStrategyAction, saveGeneratedStrategyAction, updateStrategySummaryAction, createPillarAction } from "@/app/app/(shell)/strategy/actions";
import { formatDateTime } from "@/lib/utils";
import type { ContentStrategy, ContentPillar } from "@/types/database";

interface DraftPillar {
  name: string;
  description: string;
  recommended_percentage: number;
}

interface StrategyDraft {
  strategy_summary: string;
  monthly_theme: string | null;
  pillars: DraftPillar[];
  strategic_recommendations: string[];
}

export function StrategyView({
  workspaceId,
  strategy,
  pillars: initialPillars,
}: {
  workspaceId: string;
  strategy: ContentStrategy | null;
  pillars: ContentPillar[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [pillars, setPillars] = useState(initialPillars);
  const [summary, setSummary] = useState(strategy?.strategy_summary ?? "");
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [addingPillar, setAddingPillar] = useState(false);
  const [pillarDraft, setPillarDraft] = useState({ name: "", description: "", recommended_percentage: 0 });
  const [creatingManually, setCreatingManually] = useState(false);
  const [manualDraft, setManualDraft] = useState({ strategy_summary: "", monthly_theme: "" });
  const [creatingSummary, setCreatingSummary] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // AI review-before-save state — a generated strategy never touches the
  // database until the user explicitly accepts it here.
  const [draft, setDraft] = useState<StrategyDraft | null>(null);
  const [draftEdited, setDraftEdited] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Browser-level backstop against accidental loss (Phase 7 spec section 8):
  // an in-review AI draft with edits, an unsaved summary edit, or a
  // part-written manual strategy are all meaningful enough amounts of work
  // to warn before a tab close/refresh discards them.
  useUnsavedChangesWarning(draftEdited || summaryDirty || (creatingManually && manualDraft.strategy_summary.trim() !== ""));

  async function handleCreateManually() {
    if (!manualDraft.strategy_summary.trim()) {
      setCreateError("Describe your content strategy to continue.");
      return;
    }
    setCreateError(null);
    setCreatingSummary(true);
    const result = await createStrategyAction(workspaceId, {
      strategy_summary: manualDraft.strategy_summary,
      monthly_theme: manualDraft.monthly_theme || null,
      content_mix: [],
    });
    setCreatingSummary(false);
    if (result.error) {
      toast({ title: "Couldn't create strategy", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Strategy created", variant: "success" });
    router.refresh();
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerationError(null);
    try {
      const res = await fetch("/api/ai/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't generate your strategy right now.");
      setDraft(data.draft);
      setDraftEdited(false);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "We couldn't generate your strategy right now.");
    } finally {
      setGenerating(false);
    }
  }

  function updateDraft<K extends keyof StrategyDraft>(key: K, value: StrategyDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDraftEdited(true);
  }

  function updateDraftPillar(index: number, patch: Partial<DraftPillar>) {
    setDraft((prev) => (prev ? { ...prev, pillars: prev.pillars.map((p, i) => (i === index ? { ...p, ...patch } : p)) } : prev));
    setDraftEdited(true);
  }

  function removeDraftPillar(index: number) {
    setDraft((prev) => (prev ? { ...prev, pillars: prev.pillars.filter((_, i) => i !== index) } : prev));
    setDraftEdited(true);
  }

  async function handleSaveDraft() {
    if (!draft) return;
    if (draft.pillars.length === 0) {
      toast({ title: "Add at least one content pillar before saving", variant: "error" });
      return;
    }
    setSavingDraft(true);
    const result = await saveGeneratedStrategyAction(
      workspaceId,
      { strategy_summary: draft.strategy_summary, monthly_theme: draft.monthly_theme, pillars: draft.pillars },
      draftEdited,
    );
    setSavingDraft(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Strategy saved", variant: "success" });
    setDraft(null);
    router.refresh();
  }

  async function handleSaveSummary() {
    if (!strategy) return;
    setSavingSummary(true);
    const result = await updateStrategySummaryAction(strategy.id, { strategy_summary: summary });
    setSavingSummary(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
      return;
    }
    setSummaryDirty(false);
    toast({ title: "Strategy summary saved", variant: "success" });
  }

  async function handleAddPillar() {
    if (!strategy || !pillarDraft.name.trim()) return;
    const result = await createPillarAction(workspaceId, strategy.id, pillarDraft);
    if (result.error) {
      toast({ title: "Couldn't add pillar", description: result.error, variant: "error" });
      return;
    }
    router.refresh();
    setAddingPillar(false);
    setPillarDraft({ name: "", description: "", recommended_percentage: 0 });
  }

  const totalPercentage = pillars.reduce((sum, p) => sum + p.recommended_percentage, 0);

  // --- AI-generated draft under review — takes over the whole panel until
  // the user saves or discards it, whether or not a strategy already exists.
  if (draft) {
    const draftTotal = draft.pillars.reduce((sum, p) => sum + p.recommended_percentage, 0);
    return (
      <div className="grid gap-6">
        <Card className="border-constory-blue/40">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-constory-blue" aria-hidden="true" />
                <CardTitle>Review your generated strategy</CardTitle>
              </div>
              <CardDescription>Nothing is saved yet — edit anything below, then accept or regenerate.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-text-primary" htmlFor="draft-summary">
                Strategy summary
              </label>
              <Textarea id="draft-summary" rows={4} value={draft.strategy_summary} onChange={(e) => updateDraft("strategy_summary", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-text-primary" htmlFor="draft-theme">
                Monthly theme <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <Input id="draft-theme" value={draft.monthly_theme ?? ""} onChange={(e) => updateDraft("monthly_theme", e.target.value || null)} />
            </div>
            {draft.strategic_recommendations.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-sm font-medium text-text-primary">Recommendations</p>
                <ul className="grid gap-1 text-sm text-text-secondary">
                  {draft.strategic_recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden="true">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Content pillars</CardTitle>
            <CardDescription>{draftTotal === 100 ? "Pillars add up to 100%." : `Pillars currently total ${draftTotal}%.`}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {draft.pillars.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <Input value={p.name} onChange={(e) => updateDraftPillar(i, { name: e.target.value })} className="font-medium" />
                  <Button variant="ghost" size="icon" onClick={() => removeDraftPillar(i)} aria-label={`Remove ${p.name}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea rows={2} value={p.description} onChange={(e) => updateDraftPillar(i, { description: e.target.value })} />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="w-24"
                    value={p.recommended_percentage}
                    onChange={(e) => updateDraftPillar(i, { recommended_percentage: Number(e.target.value) })}
                  />
                  <span className="text-sm text-text-secondary">% of content</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {generationError && <ErrorState message={generationError} onRetry={handleGenerate} />}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(null);
              setGenerationError(null);
            }}
            disabled={savingDraft}
          >
            Discard
          </Button>
          <Button variant="secondary" onClick={handleGenerate} loading={generating} disabled={savingDraft}>
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
          <Button onClick={handleSaveDraft} loading={savingDraft}>
            Save Strategy
          </Button>
        </div>

        <GenerationOverlay active={generating} stages={STRATEGY_STAGES} title="Rebuilding your strategy" />
      </div>
    );
  }

  if (!strategy) {
    if (creatingManually) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Create your content strategy</CardTitle>
            <CardDescription>Write your strategy in your own words — you can add content pillars once it&apos;s saved.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="strategy-summary" className="text-sm font-medium text-text-primary">
                Strategy summary
              </label>
              <Textarea
                id="strategy-summary"
                rows={5}
                placeholder="Describe the strategic direction for your content — who it's for, what it should achieve, and how it should feel."
                value={manualDraft.strategy_summary}
                onChange={(e) => setManualDraft({ ...manualDraft, strategy_summary: e.target.value })}
              />
              {createError && <p className="text-sm text-danger">{createError}</p>}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="strategy-theme" className="text-sm font-medium text-text-primary">
                Monthly theme <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <Input
                id="strategy-theme"
                placeholder="e.g. Back to school"
                value={manualDraft.monthly_theme}
                onChange={(e) => setManualDraft({ ...manualDraft, monthly_theme: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreatingManually(false)} disabled={creatingSummary}>
                Cancel
              </Button>
              <Button onClick={handleCreateManually} loading={creatingSummary}>
                Create strategy
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        <EmptyState
          icon={Compass}
          title="You haven't built your content strategy yet"
          description="Your strategy provides the foundation for your content ideas and calendar. Write it yourself, or let Constory generate a starting point to review and edit."
          action={
            <div className="grid justify-items-center gap-2">
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setCreatingManually(true)}>Create Manually</Button>
                <Button variant="secondary" onClick={handleGenerate} loading={generating}>
                  <Sparkles className="h-4 w-4" />
                  Generate with AI
                </Button>
              </div>
              <p className="text-xs text-text-muted">AI generation requires an OpenAI key to be configured — manual creation always works.</p>
            </div>
          }
        />
        {generationError && <ErrorState message={generationError} onRetry={handleGenerate} className="mt-4" />}
        <GenerationOverlay active={generating} stages={STRATEGY_STAGES} title="Building your strategy" />
      </>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Strategy summary</CardTitle>
            <CardDescription>Last updated {formatDateTime(strategy.updated_at)}</CardDescription>
          </div>
          <Button variant="secondary" size="sm" onClick={handleGenerate} loading={generating}>
            <Sparkles className="h-4 w-4" />
            Regenerate with AI
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Textarea
            rows={5}
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setSummaryDirty(true);
            }}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSaveSummary} loading={savingSummary} disabled={!summaryDirty} className="justify-self-start">
              Save changes
            </Button>
            {summaryDirty && !savingSummary && <span className="text-xs text-text-muted">Unsaved changes</span>}
          </div>
        </CardContent>
      </Card>

      {generationError && <ErrorState message={generationError} onRetry={handleGenerate} />}

      <Card>
        <CardHeader>
          <CardTitle>Content mix</CardTitle>
          <CardDescription>
            {totalPercentage === 100 ? "Your pillars add up to 100% of planned content." : `Pillars currently total ${totalPercentage}% — adjust so they sum to 100%.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContentMixBar segments={pillars.map((p) => ({ name: p.name, percentage: p.recommended_percentage }))} />
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Content pillars</h2>
          {!addingPillar && (
            <Button variant="secondary" size="sm" onClick={() => setAddingPillar(true)}>
              <Plus className="h-4 w-4" />
              Add pillar
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {pillars.map((p) => (
            <PillarCard
              key={p.id}
              pillar={p}
              onChange={(updated) => setPillars((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
              onDeleted={() => setPillars((prev) => prev.filter((x) => x.id !== p.id))}
            />
          ))}
        </div>

        {addingPillar && (
          <Card>
            <CardContent className="grid gap-3 pt-6">
              <Input placeholder="Pillar name" value={pillarDraft.name} onChange={(e) => setPillarDraft({ ...pillarDraft, name: e.target.value })} />
              <Textarea
                rows={2}
                placeholder="Description"
                value={pillarDraft.description}
                onChange={(e) => setPillarDraft({ ...pillarDraft, description: e.target.value })}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-24"
                  value={pillarDraft.recommended_percentage}
                  onChange={(e) => setPillarDraft({ ...pillarDraft, recommended_percentage: Number(e.target.value) })}
                />
                <span className="text-sm text-text-secondary">% of content</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAddingPillar(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddPillar} disabled={!pillarDraft.name.trim()}>
                  Add pillar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <GenerationOverlay active={generating} stages={STRATEGY_STAGES} title="Rebuilding your strategy" />
    </div>
  );
}
