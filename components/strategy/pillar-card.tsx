"use client";

import { useState } from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/components/ui/toast";
import { updatePillarAction, deletePillarAction } from "@/app/app/(shell)/strategy/actions";
import type { ContentPillar } from "@/types/database";

export function PillarCard({ pillar, onChange, onDeleted }: { pillar: ContentPillar; onChange: (p: ContentPillar) => void; onDeleted: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: pillar.name,
    description: pillar.description,
    recommended_percentage: pillar.recommended_percentage,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    const result = await updatePillarAction(pillar.id, draft);
    setBusy(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
      return;
    }
    onChange({ ...pillar, ...draft, source: "AI_EDITED" });
    setEditing(false);
    toast({ title: "Pillar saved", variant: "success" });
  }

  async function handleDelete() {
    setBusy(true);
    const result = await deletePillarAction(pillar.id);
    setBusy(false);
    setConfirmDelete(false);
    if (result.error) {
      toast({ title: "Couldn't remove", description: result.error, variant: "error" });
      return;
    }
    onDeleted();
  }

  if (editing) {
    return (
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Pillar name" />
          <Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description" />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={draft.recommended_percentage}
              onChange={(e) => setDraft({ ...draft, recommended_percentage: Number(e.target.value) })}
              className="w-24"
            />
            <span className="text-sm text-text-secondary">% of content</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} loading={busy}>
              <Check className="h-4 w-4" /> Save
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-2 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary">{pillar.name}</h3>
            <Badge variant="blue">{pillar.recommended_percentage}%</Badge>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label={`Edit ${pillar.name}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${pillar.name}`}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-text-secondary">{pillar.description}</p>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the &ldquo;{pillar.name}&rdquo; pillar?</AlertDialogTitle>
            <AlertDialogDescription>
              Posts already using this pillar will keep their content but lose the pillar tag. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
