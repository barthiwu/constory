"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FormField } from "@/components/layout/form-field";
import { EmptyState } from "@/components/layout/empty-state";
import { useToast } from "@/components/ui/toast";
import { addIdeaToCalendarAction } from "@/app/app/(shell)/ideas/actions";
import { platformLabel } from "@/lib/constants";
import { CalendarDays } from "lucide-react";
import type { ContentCalendar, ContentIdea } from "@/types/database";

export function AddToCalendarDialog({
  idea,
  calendars,
  open,
  onOpenChange,
  onAdded,
}: {
  idea: ContentIdea | null;
  calendars: ContentCalendar[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [platform, setPlatform] = useState(idea?.recommended_platform ?? "instagram");
  const [saving, setSaving] = useState(false);
  // This dialog stays mounted between opens (IdeasView toggles `open` rather
  // than remounting it), so re-derive the platform default from the newly
  // selected idea's AI recommendation each time a different idea is opened,
  // instead of leaving the previous idea's choice in place. The user can
  // still change it freely — this only sets the starting point.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(idea?.id ?? null);
  if (open && idea && idea.id !== prefilledFor) {
    setPrefilledFor(idea.id);
    setPlatform(idea.recommended_platform ?? "instagram");
  }

  const activeCalendar = calendars.find((c) => c.id === calendarId);
  const platformOptions = activeCalendar?.selected_platforms?.length ? activeCalendar.selected_platforms : ["instagram", "facebook", "linkedin", "tiktok", "x"];

  async function handleAdd() {
    if (!idea || !calendarId) return;
    setSaving(true);
    const result = await addIdeaToCalendarAction(idea.id, calendarId, date, platform);
    setSaving(false);
    if (result.error) {
      toast({ title: "Couldn't add to calendar", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Added to calendar", variant: "success" });
    onOpenChange(false);
    onAdded();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to calendar</DialogTitle>
          <DialogDescription>{idea?.title}</DialogDescription>
        </DialogHeader>

        {idea && (idea.recommended_format || idea.content_objective || idea.suggested_hook) && (
          <p className="rounded-md bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
            The new post will start from this idea&apos;s brief{idea.recommended_format ? `, ${idea.recommended_format.toLowerCase()} format` : ""}
            {idea.content_objective ? `, and a "${idea.content_objective}" objective` : ""} — you can change anything after it&apos;s created.
          </p>
        )}

        {calendars.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No calendars yet"
            description="Create a calendar first, then add this idea to it."
          />
        ) : (
          <div className="grid gap-4">
            <FormField label="Calendar" htmlFor="atc-calendar">
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger id="atc-calendar">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Date" htmlFor="atc-date">
              <Input id="atc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField label="Platform" htmlFor="atc-platform">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="atc-platform">
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
        )}

        <DialogFooter>
          <Button onClick={handleAdd} loading={saving} disabled={calendars.length === 0}>
            Add to calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
