"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { createIdeaAction, updateIdeaAction } from "@/app/app/(shell)/ideas/actions";
import type { ContentIdea, ContentPillar } from "@/types/database";

interface IdeaDialogProps {
  workspaceId: string;
  pillars: ContentPillar[];
  idea?: ContentIdea | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function IdeaDialog({ workspaceId, pillars, idea, open, onOpenChange, onSaved }: IdeaDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(idea?.title ?? "");
  const [description, setDescription] = useState(idea?.description ?? "");
  const [pillarId, setPillarId] = useState<string>(idea?.content_pillar_id ?? "none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setError(null);
    setSaving(true);
    const input = { title, description, content_pillar_id: pillarId === "none" ? null : pillarId };
    const result = idea ? await updateIdeaAction(idea.id, input) : await createIdeaAction(workspaceId, input);
    setSaving(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
      return;
    }
    toast({ title: idea ? "Idea updated" : "Idea added", variant: "success" });
    setTitle("");
    setDescription("");
    setPillarId("none");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{idea ? "Edit idea" : "Add idea"}</DialogTitle>
          <DialogDescription>Capture the idea now — you can turn it into a scheduled post later.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField label="Title" htmlFor="idea-title" error={error ?? undefined} required>
            <Input id="idea-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </FormField>
          <FormField label="Description" htmlFor="idea-description" hint="Optional">
            <Textarea id="idea-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField label="Pillar" htmlFor="idea-pillar" hint="Optional">
            <Select value={pillarId} onValueChange={setPillarId}>
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
        </div>
        <DialogFooter>
          <Button onClick={handleSave} loading={saving}>
            {idea ? "Save changes" : "Add idea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
