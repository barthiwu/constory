"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
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
import { createProductAction, updateProductAction, deleteProductAction } from "@/app/app/(shell)/brand/actions";
import type { ProductService } from "@/types/database";
import { Package } from "lucide-react";

export function ProductsSection({ workspaceId, products }: { workspaceId: string; products: ProductService[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState(products);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", category: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", description: "", category: "" });
  const [deleteTarget, setDeleteTarget] = useState<ProductService | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (!draft.name.trim()) return;
    setBusy(true);
    const result = await createProductAction(workspaceId, draft);
    setBusy(false);
    if ("error" in result) {
      toast({ title: "Couldn't add", description: result.error, variant: "error" });
      return;
    }
    setItems((prev) => [...prev, result.product]);
    toast({ title: "Added", variant: "success" });
    setDraft({ name: "", description: "", category: "" });
    setAdding(false);
  }

  function startEdit(p: ProductService) {
    setEditingId(p.id);
    setEditDraft({ name: p.name, description: p.description, category: p.category ?? "" });
  }

  async function handleSaveEdit(id: string) {
    setBusy(true);
    const result = await updateProductAction(id, editDraft);
    setBusy(false);
    if ("error" in result) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
      return;
    }
    setItems((prev) => prev.map((p) => (p.id === id ? result.product : p)));
    setEditingId(null);
    toast({ title: "Saved", variant: "success" });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    const result = await deleteProductAction(deleteTarget.id);
    setBusy(false);
    setDeleteTarget(null);
    if ("error" in result) {
      toast({ title: "Couldn't remove", description: result.error, variant: "error" });
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    toast({ title: "Removed", variant: "success" });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Products & Services</CardTitle>
          <CardDescription>What you offer — grounds content in what you actually sell.</CardDescription>
        </div>
        {!adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Add product/service
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.length === 0 && !adding && (
          <EmptyState icon={Package} title="No products or services yet" description="Add what you offer so Constory can ground content in it." />
        )}

        {items.map((p) =>
          editingId === p.id ? (
            <div key={p.id} className="grid gap-2 rounded-md border border-constory-blue bg-blue-light/30 p-3">
              <Input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} placeholder="Name" />
              <Textarea
                rows={2}
                value={editDraft.description}
                onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                placeholder="Description"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" /> Cancel
                </Button>
                <Button size="sm" onClick={() => handleSaveEdit(p.id)} loading={busy}>
                  <Check className="h-4 w-4" /> Save
                </Button>
              </div>
            </div>
          ) : (
            <div key={p.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="grid gap-0.5">
                <p className="text-sm font-medium text-text-primary">{p.name}</p>
                {p.description && <p className="text-sm text-text-secondary">{p.description}</p>}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)} aria-label={`Delete ${p.name}`}>
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </div>
          ),
        )}

        {adding && (
          <div className="grid gap-2 rounded-md border border-dashed border-border p-4">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Product or service name" autoFocus />
            <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description (optional)" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} loading={busy} disabled={!draft.name.trim()}>
                Add
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
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
