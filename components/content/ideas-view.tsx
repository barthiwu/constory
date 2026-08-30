"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { deleteIdeaAction } from "@/app/app/(shell)/ideas/actions";
import type { ContentIdea, ContentPillar, ContentCalendar } from "@/types/database";

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

  const pillarById = new Map(pillars.map((p) => [p.id, p]));

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
          title="Every great content plan starts with an idea"
          description="Add your own idea, or let Constory generate some based on your strategy."
          action={
            <Button onClick={() => setDialogIdea(null)}>
              <Plus className="h-4 w-4" />
              Add Idea
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              pillar={idea.content_pillar_id ? pillarById.get(idea.content_pillar_id) : undefined}
              onEdit={() => setDialogIdea(idea)}
              onDelete={() => setDeleteTarget(idea)}
              onAddToCalendar={() => setCalendarIdea(idea)}
            />
          ))}
        </div>
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
