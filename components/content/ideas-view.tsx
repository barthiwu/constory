"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Plus, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { deleteIdeaAction, updateIdeaAction } from "@/app/app/(shell)/ideas/actions";
import { filterIdeas } from "@/lib/ideas-filter";
import type { ContentIdea, ContentPillar, ContentCalendar, IdeaStatus } from "@/types/database";

const STATUS_FILTERS: Array<{ value: IdeaStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "used", label: "Used" },
  { value: "archived", label: "Archived" },
];

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
      router.refresh();
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "We couldn't generate ideas right now.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteIdeaAction(deleteTarget.id);
    setDeleteTarget(null);
    if (result.error) toast({ title: "Couldn't remove", description: result.error, variant: "error" });
    else router.refresh();
  }

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

      {ideas.length === 0 ? (
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
