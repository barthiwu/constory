"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FormField } from "@/components/layout/form-field";
import { DiscardChangesDialog } from "@/components/layout/discard-changes-dialog";
import { useToast } from "@/components/ui/toast";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { createIdeaAction, updateIdeaAction } from "@/app/app/(shell)/ideas/actions";
import { PLATFORM_OPTIONS, CONTENT_FORMAT_OPTIONS } from "@/lib/constants";
import type { ContentIdea, ContentPillar } from "@/types/database";

interface IdeaDialogProps {
  workspaceId: string;
  pillars: ContentPillar[];
  idea?: ContentIdea | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FormState {
  title: string;
  description: string;
  pillarId: string;
  platform: string;
  format: string;
  objective: string;
  hook: string;
}

function emptyState(): FormState {
  return { title: "", description: "", pillarId: "none", platform: "none", format: "none", objective: "", hook: "" };
}

function stateFromIdea(idea: ContentIdea): FormState {
  return {
    title: idea.title,
    description: idea.description,
    pillarId: idea.content_pillar_id ?? "none",
    platform: idea.recommended_platform ?? "none",
    format: idea.recommended_format ?? "none",
    objective: idea.content_objective ?? "",
    hook: idea.suggested_hook ?? "",
  };
}

export function IdeaDialog({ workspaceId, pillars, idea, open, onOpenChange, onSaved }: IdeaDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => (idea ? stateFromIdea(idea) : emptyState()));
  // Tracks which `idea` (by id, or "new" for the create form) `form` was
  // last derived from, so switching the edit target — or reopening for a
  // fresh "Add idea" — resyncs the form instead of showing stale data left
  // over from whatever was open before. This dialog is never unmounted
  // between opens (it's rendered once by IdeasView), so a plain useState
  // initializer alone would only ever run once.
  const [syncedFor, setSyncedFor] = useState<string>(idea?.id ?? "new");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const targetKey = idea?.id ?? "new";
  if (open && targetKey !== syncedFor) {
    setSyncedFor(targetKey);
    setForm(idea ? stateFromIdea(idea) : emptyState());
    setError(null);
    setDirty(false);
  }

  useUnsavedChangesWarning(open && dirty);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setError(null);
    setSaving(true);
    const input = {
      title: form.title,
      description: form.description,
      content_pillar_id: form.pillarId === "none" ? null : form.pillarId,
      recommended_platform: form.platform === "none" ? null : form.platform,
      recommended_format: form.format === "none" ? null : form.format,
      content_objective: form.objective.trim() || null,
      suggested_hook: form.hook.trim() || null,
    };
    const result = idea ? await updateIdeaAction(idea.id, input) : await createIdeaAction(workspaceId, input);
    setSaving(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
      return;
    }
    toast({ title: idea ? "Idea updated" : "Idea added", variant: "success" });
    setDirty(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : requestClose())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{idea ? "Edit idea" : "Add idea"}</DialogTitle>
            <DialogDescription>Capture the idea now — you can turn it into a scheduled post later.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FormField label="Title" htmlFor="idea-title" error={error ?? undefined} required>
              <Input id="idea-title" value={form.title} onChange={(e) => update("title", e.target.value)} autoFocus />
            </FormField>
            <FormField label="Description" htmlFor="idea-description" hint="Optional">
              <Textarea id="idea-description" rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
            </FormField>
            <FormField label="Pillar" htmlFor="idea-pillar" hint="Optional">
              <Select value={form.pillarId} onValueChange={(v) => update("pillarId", v)}>
                <SelectTrigger id="idea-pillar">
                  <SelectValue placeholder="No pillar" />
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

            {/* Content details — where this idea would live if turned into a post.
                Filled in by AI when generated, but always editable: nothing here
                is locked just because it originated as a suggestion. */}
            <div className="grid gap-4 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Content details (optional)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Recommended platform" htmlFor="idea-platform">
                  <Select value={form.platform} onValueChange={(v) => update("platform", v)}>
                    <SelectTrigger id="idea-platform">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {PLATFORM_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Recommended format" htmlFor="idea-format">
                  <Select value={form.format} onValueChange={(v) => update("format", v)}>
                    <SelectTrigger id="idea-format">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {CONTENT_FORMAT_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              <FormField label="Content objective" htmlFor="idea-objective" hint='e.g. "Educate", "Engage", "Promote"'>
                <Input id="idea-objective" value={form.objective} onChange={(e) => update("objective", e.target.value)} />
              </FormField>
              <FormField label="Suggested hook" htmlFor="idea-hook" hint="An opening line that would stop the scroll">
                <Textarea id="idea-hook" rows={2} value={form.hook} onChange={(e) => update("hook", e.target.value)} />
              </FormField>
            </div>
          </div>
          <DialogFooter>
            {dirty && !saving && <span className="mr-auto self-center text-xs text-text-muted">Unsaved changes</span>}
            <Button variant="ghost" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {idea ? "Save changes" : "Add idea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={() => {
          setConfirmDiscard(false);
          setDirty(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
