"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { CONTENT_FORMAT_OPTIONS, platformLabel } from "@/lib/constants";
import { createPostAction } from "@/app/app/(shell)/calendars/actions";
import type { ContentCalendar, ContentPillar } from "@/types/database";

export function CreatePostDialog({
  calendarId,
  calendar,
  pillars,
  open,
  onOpenChange,
}: {
  calendarId: string;
  calendar: ContentCalendar;
  pillars: ContentPillar[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const platformOptions = calendar.selected_platforms.length > 0 ? calendar.selected_platforms : ["instagram"];

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(calendar.start_date);
  const [platform, setPlatform] = useState(platformOptions[0]);
  const [pillarId, setPillarId] = useState("none");
  const [format, setFormat] = useState<string>("");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setError(null);
    setSaving(true);
    const result = await createPostAction(calendarId, {
      title,
      scheduled_date: date,
      platform,
      content_pillar_id: pillarId === "none" ? null : pillarId,
      format: format || null,
      brief: brief || null,
      status: "draft",
    });
    setSaving(false);
    if (result.error) {
      toast({ title: "Couldn't create post", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Post added", variant: "success" });
    setTitle("");
    setBrief("");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add content</DialogTitle>
          <DialogDescription>Create a post manually — you can generate the rest of its details afterward.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField label="Title" htmlFor="np-title" error={error ?? undefined} required>
            <Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" htmlFor="np-date">
              <Input id="np-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField label="Platform" htmlFor="np-platform">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="np-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {platformOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {platformLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Pillar" htmlFor="np-pillar" hint="Optional">
              <Select value={pillarId} onValueChange={setPillarId}>
                <SelectTrigger id="np-pillar">
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
            <FormField label="Format" htmlFor="np-format" hint="Optional">
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id="np-format">
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
          </div>
          <FormField label="Brief" htmlFor="np-brief" hint="Optional">
            <Textarea id="np-brief" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} loading={saving}>
            Add content
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
