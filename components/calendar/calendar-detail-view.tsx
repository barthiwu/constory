"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, MoreHorizontal, Plus, RefreshCw, Sparkles, Trash2, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { useToast } from "@/components/ui/toast";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
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
import { deleteCalendarAction, duplicateCalendarAction, saveGeneratedCalendarAction } from "@/app/app/(shell)/calendars/actions";
import { PLATFORM_OPTIONS, CONTENT_FORMAT_OPTIONS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { CalendarPost, ContentCalendar, ContentPillar } from "@/types/database";
import type { CreatePostInput } from "@/services/calendar-service";

type ViewMode = "month" | "week" | "list";
type DraftPost = CreatePostInput & { _draftKey: string };

function toCreatePostInput(post: DraftPost): CreatePostInput {
  const input: CreatePostInput & { _draftKey?: string } = { ...post };
  delete input._draftKey;
  return input;
}

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

  // AI review-before-save state — a generated calendar's posts never touch
  // the database until the user accepts them here.
  const [draftPosts, setDraftPosts] = useState<DraftPost[] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  // A generated calendar's worth of draft posts is meaningful, easily
  // multi-post work — warn before a tab close/refresh silently discards it.
  useUnsavedChangesWarning(!!draftPosts && draftPosts.length > 0);

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
      setDraftPosts(data.posts);
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

  function updateDraftPost(key: string, patch: Partial<DraftPost>) {
    setDraftPosts((prev) => (prev ? prev.map((p) => (p._draftKey === key ? { ...p, ...patch } : p)) : prev));
  }

  function removeDraftPost(key: string) {
    setDraftPosts((prev) => (prev ? prev.filter((p) => p._draftKey !== key) : prev));
  }

  async function handleSaveDraftPosts() {
    if (!draftPosts || draftPosts.length === 0) return;
    setSavingDraft(true);
    const result = await saveGeneratedCalendarAction(calendar.id, draftPosts.map(toCreatePostInput));
    setSavingDraft(false);
    if (result.error) {
      toast({ title: "Couldn't save calendar", description: result.error, variant: "error" });
      return;
    }
    toast({ title: `Saved ${result.count} posts`, variant: "success" });
    setDraftPosts(null);
    router.refresh();
  }

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
        {!draftPosts && (
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
        )}
      </div>

      {generationError && <ErrorState message={generationError} onRetry={handleGenerate} />}

      {draftPosts ? (
        <div className="grid gap-4">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Sparkles className="h-4 w-4 text-constory-blue" aria-hidden="true" />
            Review your generated calendar — nothing is saved yet. Edit or remove posts, then save the plan.
          </div>
          <div className="grid gap-3">
            {draftPosts
              .slice()
              .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
              .map((p) => (
                <Card key={p._draftKey}>
                  <CardContent className="grid gap-3 pt-6 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                    <div className="text-sm font-medium text-text-secondary sm:pt-2">{formatDate(p.scheduled_date)}</div>
                    <div className="grid gap-2">
                      <Input value={p.title} onChange={(e) => updateDraftPost(p._draftKey, { title: e.target.value })} className="font-medium" />
                      <div className="flex flex-wrap gap-2">
                        <Select value={p.platform} onValueChange={(v) => updateDraftPost(p._draftKey, { platform: v })}>
                          <SelectTrigger className="w-36" aria-label="Platform">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLATFORM_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={p.content_pillar_id ?? "none"}
                          onValueChange={(v) => updateDraftPost(p._draftKey, { content_pillar_id: v === "none" ? null : v })}
                        >
                          <SelectTrigger className="w-40" aria-label="Pillar">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No pillar</SelectItem>
                            {pillars.map((pillar) => (
                              <SelectItem key={pillar.id} value={pillar.id}>
                                {pillar.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={p.format ?? ""} onValueChange={(v) => updateDraftPost(p._draftKey, { format: v })}>
                          <SelectTrigger className="w-40" aria-label="Format">
                            <SelectValue placeholder="Format" />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTENT_FORMAT_OPTIONS.map((f) => (
                              <SelectItem key={f} value={f}>
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {p.brief && <p className="text-xs text-text-muted">{p.brief}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeDraftPost(p._draftKey)} aria-label={`Remove ${p.title}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
          {draftPosts.length === 0 && <p className="text-sm text-text-secondary">All posts removed. Regenerate for a fresh plan.</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setDraftPosts(null)} disabled={savingDraft}>
              Discard
            </Button>
            <Button variant="secondary" onClick={handleGenerate} loading={generating} disabled={savingDraft}>
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
            <Button onClick={handleSaveDraftPosts} loading={savingDraft} disabled={draftPosts.length === 0}>
              Save Calendar ({draftPosts.length} posts)
            </Button>
          </div>
        </div>
      ) : posts.length === 0 ? (
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
            <AlertDialogTitle>Delete &ldquo;{calendar.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>This deletes every post in this calendar ({posts.length} post{posts.length === 1 ? "" : "s"}). This action cannot be undone.</AlertDialogDescription>
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
