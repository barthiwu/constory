"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, Sparkles, Trash2, X as XIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/layout/form-field";
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
import { PLATFORM_OPTIONS, POST_STATUS_OPTIONS, CONTENT_FORMAT_OPTIONS } from "@/lib/constants";
import { IMPROVE_OPTIONS, type ImproveOption } from "@/lib/ai/improve-options";
import { formatDate } from "@/lib/utils";
import { updatePostAction, duplicatePostAction, deletePostAction } from "@/app/app/(shell)/calendars/actions";
import type { CalendarPost, ContentPillar, PostStatus } from "@/types/database";

type RegenAction = "topic" | "alternative_angle" | "caption";

export function PostDetailDialog({
  calendarId,
  post,
  pillars,
  open,
  onOpenChange,
}: {
  calendarId: string;
  post: CalendarPost | null;
  pillars: ContentPillar[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [local, setLocal] = useState<CalendarPost | null>(post);
  const [prevPost, setPrevPost] = useState(post);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-sync local editable state whenever the `post` prop changes (e.g. a
  // different post is opened) — adjusted during render rather than in an
  // effect, per React's guidance for this pattern.
  if (post !== prevPost) {
    setPrevPost(post);
    setLocal(post);
    setError(null);
  }

  if (!local) return null;

  function update<K extends keyof CalendarPost>(key: K, value: CalendarPost[K]) {
    setLocal((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function callAI(body: Record<string, unknown>): Promise<CalendarPost | null> {
    setError(null);
    try {
      const res = await fetch("/api/ai/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't regenerate this right now.");
      return data.post as CalendarPost;
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't regenerate this right now.");
      return null;
    }
  }

  async function handleRegen(action: RegenAction) {
    if (!local) return;
    setBusyAction(action);
    const updated = await callAI({ action, postId: local.id });
    setBusyAction(null);
    if (updated) {
      setLocal(updated);
      router.refresh();
      toast({ title: "Regenerated", variant: "success" });
    }
  }

  async function handleImprove(field: "caption" | "hook" | "cta" | "creative_direction", option: ImproveOption) {
    if (!local) return;
    setBusyAction(`improve-${field}`);
    const updated = await callAI({ action: "improve", postId: local.id, field, option });
    setBusyAction(null);
    if (updated) {
      setLocal(updated);
      router.refresh();
      toast({ title: "Updated", variant: "success" });
    }
  }

  async function handleRegenField(field: "hook" | "cta" | "creative_direction") {
    if (!local) return;
    setBusyAction(`field-${field}`);
    const updated = await callAI({ action: "field", postId: local.id, field });
    setBusyAction(null);
    if (updated) {
      setLocal(updated);
      router.refresh();
      toast({ title: "Regenerated", variant: "success" });
    }
  }

  async function handleSave() {
    if (!local) return;
    setSaving(true);
    const result = await updatePostAction(calendarId, local.id, {
      title: local.title,
      scheduled_date: local.scheduled_date,
      platform: local.platform,
      status: local.status,
      content_pillar_id: local.content_pillar_id,
      objective: local.objective,
      format: local.format,
      brief: local.brief,
      hook: local.hook,
      caption: local.caption,
      cta: local.cta,
      hashtags: local.hashtags,
      creative_direction: local.creative_direction,
    });
    setSaving(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Post saved", variant: "success" });
    router.refresh();
  }

  async function handleDuplicate() {
    if (!local) return;
    const result = await duplicatePostAction(calendarId, local.id);
    if (result.error) {
      toast({ title: "Couldn't duplicate", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Post duplicated", variant: "success" });
    router.refresh();
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!local) return;
    const result = await deletePostAction(calendarId, local.id);
    setConfirmDelete(false);
    if (result.error) {
      toast({ title: "Couldn't delete", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Post deleted", variant: "success" });
    router.refresh();
    onOpenChange(false);
  }

  function addHashtag() {
    const tag = hashtagDraft.trim().replace(/^#/, "");
    if (!tag) return;
    if (!local?.hashtags.includes(tag)) update("hashtags", [...(local?.hashtags ?? []), tag]);
    setHashtagDraft("");
  }

  function removeHashtag(tag: string) {
    update("hashtags", (local?.hashtags ?? []).filter((h) => h !== tag));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="grid flex-1 gap-1">
              <Input
                value={local.title}
                onChange={(e) => update("title", e.target.value)}
                className="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              />
              <DialogTitle className="sr-only">Edit post</DialogTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <span>{formatDate(local.scheduled_date)}</span>
                <span aria-hidden="true">·</span>
                <Badge variant="outline">{local.platform}</Badge>
                <Badge variant={local.status === "completed" ? "success" : local.status === "planned" ? "blue" : "default"}>
                  {local.status}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        {error && <ErrorState message={error} className="mb-2" />}

        <div className="grid gap-6">
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" loading={busyAction === "topic" || busyAction === "alternative_angle"}>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate topic
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => handleRegen("topic")}>New title, brief & hook</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleRegen("alternative_angle")}>Alternative angle</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" size="sm" onClick={handleDuplicate}>
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
            <Button variant="destructive-ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>

          {/* Section 1 — Strategy */}
          <section className="grid gap-3 sm:grid-cols-3">
            <FormField label="Pillar" htmlFor="post-pillar">
              <Select value={local.content_pillar_id ?? "none"} onValueChange={(v) => update("content_pillar_id", v === "none" ? null : v)}>
                <SelectTrigger id="post-pillar">
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
            </FormField>
            <FormField label="Objective" htmlFor="post-objective">
              <Input id="post-objective" value={local.objective ?? ""} onChange={(e) => update("objective", e.target.value)} />
            </FormField>
            <FormField label="Format" htmlFor="post-format">
              <Select value={local.format ?? ""} onValueChange={(v) => update("format", v)}>
                <SelectTrigger id="post-format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_FORMAT_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Platform" htmlFor="post-platform">
              <Select value={local.platform} onValueChange={(v) => update("platform", v)}>
                <SelectTrigger id="post-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Status" htmlFor="post-status">
              <Select value={local.status} onValueChange={(v) => update("status", v as PostStatus)}>
                <SelectTrigger id="post-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-1.5">
            <FormField label="Scheduled date" htmlFor="post-date">
              <Input id="post-date" type="date" value={local.scheduled_date} onChange={(e) => update("scheduled_date", e.target.value)} className="w-44" />
            </FormField>
          </div>

          {/* Section 2 — Brief */}
          <FormField label="Brief" htmlFor="post-brief" hint="What this content should communicate.">
            <Textarea id="post-brief" rows={3} value={local.brief ?? ""} onChange={(e) => update("brief", e.target.value)} />
          </FormField>

          {/* Section 3 — Hook */}
          <SectionWithRegenerate label="Hook" busy={busyAction === "field-hook"} onRegenerate={() => handleRegenField("hook")}>
            <Textarea rows={2} value={local.hook ?? ""} onChange={(e) => update("hook", e.target.value)} />
          </SectionWithRegenerate>

          {/* Section 4 — Caption */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-primary">Caption</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleRegen("caption")} loading={busyAction === "caption"}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" loading={busyAction?.startsWith("improve-caption")}>
                      <Sparkles className="h-3.5 w-3.5" />
                      Improve
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Improve caption</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {IMPROVE_OPTIONS.map((opt) => (
                      <DropdownMenuItem key={opt.value} onSelect={() => handleImprove("caption", opt.value)}>
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <Textarea rows={6} value={local.caption ?? ""} onChange={(e) => update("caption", e.target.value)} />
          </div>

          {/* Section 5 — CTA */}
          <SectionWithRegenerate label="Call to action" busy={busyAction === "field-cta"} onRegenerate={() => handleRegenField("cta")}>
            <Input value={local.cta ?? ""} onChange={(e) => update("cta", e.target.value)} />
          </SectionWithRegenerate>

          {/* Section 6 — Hashtags */}
          <FormField label="Hashtags" htmlFor="post-hashtags">
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-1.5">
                {local.hashtags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 rounded-full bg-blue-light px-2.5 py-1 text-xs font-medium text-blue-hover">
                    #{tag}
                    <button type="button" onClick={() => removeHashtag(tag)} aria-label={`Remove ${tag}`}>
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="post-hashtags"
                  value={hashtagDraft}
                  onChange={(e) => setHashtagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addHashtag();
                    }
                  }}
                  placeholder="Add a hashtag and press Enter"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addHashtag}>
                  Add
                </Button>
              </div>
            </div>
          </FormField>

          {/* Section 7 — Creative direction */}
          <SectionWithRegenerate
            label="Creative direction"
            busy={busyAction === "field-creative_direction"}
            onRegenerate={() => handleRegenField("creative_direction")}
            hint="What the final visual asset should look like — carousel structure, video concept, image concept, or slide sequence."
          >
            <Textarea rows={4} value={local.creative_direction ?? ""} onChange={(e) => update("creative_direction", e.target.value)} />
          </SectionWithRegenerate>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button onClick={handleSave} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
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
    </Dialog>
  );
}

function SectionWithRegenerate({
  label,
  hint,
  busy,
  onRegenerate,
  children,
}: {
  label: string;
  hint?: string;
  busy?: boolean;
  onRegenerate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <Button variant="ghost" size="sm" onClick={onRegenerate} loading={busy}>
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
