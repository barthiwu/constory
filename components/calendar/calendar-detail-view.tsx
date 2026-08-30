"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, MoreHorizontal, Plus, Sparkles, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { useToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
import { CALENDAR_STAGES } from "@/lib/ai/stages";
import { MonthView } from "@/components/calendar/month-view";
import { WeekView } from "@/components/calendar/week-view";
import { ListView } from "@/components/calendar/list-view";
import { ExportButton } from "@/components/calendar/export-button";
import { PostDetailDialog } from "@/components/content/post-detail-dialog";
import { CreatePostDialog } from "@/components/content/create-post-dialog";
import { deleteCalendarAction, duplicateCalendarAction } from "@/app/app/(shell)/calendars/actions";
import { formatDate } from "@/lib/utils";
import type { CalendarPost, ContentCalendar, ContentPillar } from "@/types/database";

type ViewMode = "month" | "week" | "list";

export function CalendarDetailView({
  workspaceId,
  calendar,
  initialPosts,
  pillars,
  autoGenerate,
  initialPostId,
}: {
  workspaceId: string;
  calendar: ContentCalendar;
  initialPosts: CalendarPost[];
  pillars: ContentPillar[];
  autoGenerate: boolean;
  /** Deep-links directly to a post (e.g. from the dashboard's upcoming-content list). */
  initialPostId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [posts, setPosts] = useState(initialPosts);
  const [prevInitialPosts, setPrevInitialPosts] = useState(initialPosts);
  const [view, setView] = useState<ViewMode>("month");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(
    initialPostId ? (initialPosts.find((p) => p.id === initialPostId) ?? null) : null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteCalendar, setConfirmDeleteCalendar] = useState(false);

  function closePostDialog() {
    setSelectedPost(null);
    if (initialPostId) router.replace(`/app/calendars/${calendar.id}`, { scroll: false });
  }

  // Keep local `posts` in sync when the server-provided `initialPosts` prop
  // changes (e.g. after router.refresh()) — adjusted during render, per
  // React's guidance, rather than via an effect.
  if (initialPosts !== prevInitialPosts) {
    setPrevInitialPosts(initialPosts);
    setPosts(initialPosts);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerationError(null);
    try {
      const res = await fetch("/api/ai/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, calendarId: calendar.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't generate your calendar right now. Your existing information is safe.");
      toast({ title: `Generated ${data.postCount} posts`, variant: "success" });
      router.refresh();
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "We couldn't generate your calendar right now.");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    // Auto-starting generation is a deliberate side effect triggered by the
    // `autoGenerate` prop (set when arriving from the "create + generate"
    // flow), not a state derivation — the immediate setGenerating(true)
    // inside handleGenerate is the intended loading-state entry point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoGenerate) void handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);

  async function handleDuplicateCalendar() {
    const result = await duplicateCalendarAction(workspaceId, calendar.id);
    if (result.error || !result.id) {
      toast({ title: "Couldn't duplicate", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Calendar duplicated", variant: "success" });
    router.push(`/app/calendars/${result.id}`);
  }

  async function handleDeleteCalendar() {
    const result = await deleteCalendarAction(calendar.id);
    setConfirmDeleteCalendar(false);
    if (result.error) {
      toast({ title: "Couldn't delete", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Calendar deleted", variant: "success" });
    router.push("/app/calendars");
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Link href="/app/calendars" className="hover:text-text-primary">
              Calendars
            </Link>
            <span aria-hidden="true">/</span>
            <span>{calendar.name}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{calendar.name}</h1>
          <p className="text-sm text-text-secondary">
            {formatDate(calendar.start_date)} – {formatDate(calendar.end_date)} · {posts.length} posts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {posts.length > 0 && (
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="list">List</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <ExportButton calendar={calendar} posts={posts} pillars={pillars} />
          {posts.length > 0 && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Content
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleDuplicateCalendar}>
                <Copy className="h-4 w-4" />
                Duplicate calendar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirmDeleteCalendar(true)} destructive>
                <Trash2 className="h-4 w-4" />
                Delete calendar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {generationError && <ErrorState message={generationError} onRetry={handleGenerate} />}

      {posts.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="This calendar doesn't have any content yet"
          description="Let Constory generate a full plan based on your strategy, or add content manually."
          action={
            <div className="flex gap-2">
              <Button onClick={handleGenerate} loading={generating}>
                <Sparkles className="h-4 w-4" />
                Generate Content Calendar
              </Button>
              <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Content
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {view === "month" && <MonthView posts={posts} pillars={pillars} anchorDate={calendar.start_date} onOpenPost={setSelectedPost} />}
          {view === "week" && <WeekView posts={posts} pillars={pillars} anchorDate={calendar.start_date} onOpenPost={setSelectedPost} />}
          {view === "list" && <ListView posts={posts} pillars={pillars} onOpenPost={setSelectedPost} />}
        </>
      )}

      <PostDetailDialog calendarId={calendar.id} post={selectedPost} pillars={pillars} open={!!selectedPost} onOpenChange={(open) => !open && closePostDialog()} />

      <CreatePostDialog calendarId={calendar.id} calendar={calendar} pillars={pillars} open={createOpen} onOpenChange={setCreateOpen} />

      <GenerationOverlay active={generating} stages={CALENDAR_STAGES} title="Generating your calendar" />

      <AlertDialog open={confirmDeleteCalendar} onOpenChange={setConfirmDeleteCalendar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {calendar.name}?</AlertDialogTitle>
            <AlertDialogDescription>This deletes every post in this calendar. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteCalendar}>
              Delete calendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
