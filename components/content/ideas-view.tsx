"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lightbulb, Plus, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { useToast } from "@/components/ui/toast";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { GenerationOverlay } from "@/components/ai/generation-overlay";
import { IDEAS_STAGES } from "@/lib/ai/stages";
import { IdeaCard } from "@/components/content/idea-card";
import { IdeaDialog } from "@/components/content/idea-dialog";
import { AddToCalendarDialog } from "@/components/content/add-to-calendar-dialog";
import { deleteIdeaAction, updateIdeaAction, duplicateIdeaAction, saveGeneratedIdeasAction } from "@/app/app/(shell)/ideas/actions";
import { filterIdeas } from "@/lib/ideas-filter";
import type { ContentIdea, ContentPillar, ContentCalendar, IdeaStatus } from "@/types/database";

const STATUS_FILTERS: Array<{ value: IdeaStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "used", label: "Used" },
  { value: "archived", label: "Archived" },
];

interface DraftIdea {
  title: string;
  description: string;
  content_pillar_id: string | null;
  recommended_platform: string | null;
  recommended_format: string | null;
  content_objective: string | null;
  suggested_hook: string | null;
  selected: boolean;
}

export function IdeasView({
  workspaceId,
  ideas,
  pillars,
  calendars,
}: {
  workspaceId: string;
  ideas: ContentIdea[];
  pillars: ContentPillar[];
  calendars: ContentCalendar[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialogIdea, setDialogIdea] = useState<ContentIdea | null | undefined>(undefined);
  const [calendarIdea, setCalendarIdea] = useState<ContentIdea | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentIdea | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | "all">("all");
  const [pillarFilter, setPillarFilter] = useState<string>("all");

  // AI review-before-save state — generated ideas never touch the database
  // until the user selects which ones to keep and clicks Save.
  const [draftIdeas, setDraftIdeas] = useState<DraftIdea[] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const pillarById = new Map(pillars.map((p) => [p.id, p]));

  const filteredIdeas = useMemo(
    () => filterIdeas(ideas, { search, status: statusFilter, pillar: pillarFilter }),
    [ideas, search, statusFilter, pillarFilter],
  );

  const filtersActive = search.trim() !== "" || statusFilter !== "all" || pillarFilter !== "all";

  async function handleStatusChange(idea: ContentIdea, status: IdeaStatus) {
    const result = await updateIdeaAction(idea.id, { status });
    if (result.error) toast({ title: "Couldn't update status", description: result.error, variant: "error" });
    else router.refresh();
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerationError(null);
    try {
      const res = await fetch("/api/ai/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, count: 6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't generate ideas right now.");
      setDraftIdeas(
        (data.ideas as Array<Omit<DraftIdea, "selected">>).map((i) => ({ ...i, selected: true })),
      );
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "We couldn't generate ideas right now.");
    } finally {
      setGenerating(false);
    }
  }

  function updateDraftIdea(index: number, patch: Partial<DraftIdea>) {
    setDraftIdeas((prev) => (prev ? prev.map((d, i) => (i === index ? { ...d, ...patch } : d)) : prev));
  }

  function discardDraftIdea(index: number) {
    setDraftIdeas((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSaveDraftIdeas() {
    if (!draftIdeas) return;
    const selected = draftIdeas.filter((d) => d.selected);
    if (selected.length === 0) {
      toast({ title: "Select at least one idea to save", variant: "error" });
      return;
    }
    setSavingDraft(true);
    const result = await saveGeneratedIdeasAction(
      workspaceId,
      selected.map((d) => ({ title: d.title, description: d.description, content_pillar_id: d.content_pillar_id })),
    );
    setSavingDraft(false);
    if (result.error) {
      toast({ title: "Couldn't save ideas", description: result.error, variant: "error" });
      return;
    }
    toast({ title: `Saved ${result.count} idea${result.count === 1 ? "" : "s"}`, variant: "success" });
    setDraftIdeas(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteIdeaAction(deleteTarget.id);
    setDeleteTarget(null);
    if (result.error) toast({ title: "Couldn't remove", description: result.error, variant: "error" });
    else router.refresh();
  }

  async function handleDuplicate(idea: ContentIdea) {
    const result = await duplicateIdeaAction(idea.id);
    if (result.error) toast({ title: "Couldn't duplicate", description: result.error, variant: "error" });
    else router.refresh();
  }

  const selectedCount = draftIdeas?.filter((d) => d.selected).length ?? 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setDialogIdea(null)}>
          <Plus className="h-4 w-4" />
          Add Idea
        </Button>
        <Button variant="secondary" onClick={handleGenerate} loading={generating}>
          <Sparkles className="h-4 w-4" />
          Generate Ideas
        </Button>
      </div>

      {generationError && <ErrorState message={generationError} onRetry={handleGenerate} />}

      {draftIdeas ? (
        <div className="grid gap-4">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Sparkles className="h-4 w-4 text-constory-blue" aria-hidden="true" />
            Review your generated ideas — nothing is saved yet. Uncheck any you don&apos;t want, edit freely, then save the rest.
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {draftIdeas.map((d, i) => (
              <Card key={i} className={d.selected ? "" : "opacity-60"}>
                <CardContent className="grid gap-2 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraftIdea(i, { selected: !d.selected })}
                      aria-pressed={d.selected}
                      aria-label={d.selected ? "Deselect this idea" : "Select this idea"}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${d.selected ? "border-constory-blue bg-constory-blue text-white" : "border-border"}`}
                    >
                      {d.selected && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <Button variant="ghost" size="icon" onClick={() => discardDraftIdea(i)} aria-label="Discard this idea">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input value={d.title} onChange={(e) => updateDraftIdea(i, { title: e.target.value })} className="font-medium" />
                  <Textarea rows={3} value={d.description} onChange={(e) => updateDraftIdea(i, { description: e.target.value })} />
                  <Select value={d.content_pillar_id ?? "none"} onValueChange={(v) => updateDraftIdea(i, { content_pillar_id: v === "none" ? null : v })}>
                    <SelectTrigger aria-label="Pillar">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No pillar</SelectItem>
                      {pillars.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1.5">
                    {d.recommended_platform && <Badge variant="outline">{d.recommended_platform}</Badge>}
                    {d.recommended_format && <Badge variant="outline">{d.recommended_format}</Badge>}
                    {d.content_objective && <Badge variant="outline">{d.content_objective}</Badge>}
                  </div>
                  {d.suggested_hook && <p className="text-xs italic text-text-muted">Suggested hook: &ldquo;{d.suggested_hook}&rdquo;</p>}
                </CardContent>
              </Card>
            ))}
          </div>
          {draftIdeas.length === 0 && <p className="text-sm text-text-secondary">All ideas discarded. Regenerate for a fresh batch.</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setDraftIdeas(null)} disabled={savingDraft}>
              Discard All
            </Button>
            <Button variant="secondary" onClick={handleGenerate} loading={generating} disabled={savingDraft}>
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
            <Button onClick={handleSaveDraftIdeas} loading={savingDraft} disabled={draftIdeas.length === 0}>
              Save {selectedCount > 0 ? `${selectedCount} Selected` : "Selected"}
            </Button>
          </div>
        </div>
      ) : ideas.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No Content Ideas Yet"
          description="Start building a library of ideas you can use in future content — add your own, or let Constory generate some based on your strategy."
          action={
            <Button onClick={() => setDialogIdea(null)}>
              <Plus className="h-4 w-4" />
              Create Idea
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ideas..."
                aria-label="Search ideas"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as IdeaStatus | "all")}>
              <SelectTrigger className="w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pillarFilter} onValueChange={setPillarFilter}>
              <SelectTrigger className="w-44" aria-label="Filter by pillar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pillars</SelectItem>
                <SelectItem value="none">No pillar</SelectItem>
                {pillars.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredIdeas.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No ideas match your filters"
              description="Try a different search term or clear the filters."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setPillarFilter("all");
                  }}
                  disabled={!filtersActive}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredIdeas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  pillar={idea.content_pillar_id ? pillarById.get(idea.content_pillar_id) : undefined}
                  onEdit={() => setDialogIdea(idea)}
                  onDelete={() => setDeleteTarget(idea)}
                  onAddToCalendar={() => setCalendarIdea(idea)}
                  onStatusChange={(status) => handleStatusChange(idea, status)}
                  onDuplicate={() => handleDuplicate(idea)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <IdeaDialog
        workspaceId={workspaceId}
        pillars={pillars}
        idea={dialogIdea ?? null}
        open={dialogIdea !== undefined}
        onOpenChange={(open) => !open && setDialogIdea(undefined)}
        onSaved={() => router.refresh()}
      />

      <AddToCalendarDialog
        idea={calendarIdea}
        calendars={calendars}
        open={!!calendarIdea}
        onOpenChange={(open) => !open && setCalendarIdea(null)}
        onAdded={() => setCalendarIdea(null)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this idea?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GenerationOverlay active={generating} stages={IDEAS_STAGES} title="Generating ideas" />
    </div>
  );
}
