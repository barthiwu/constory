"use client";

import { Pencil, Trash2, CalendarPlus, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContentIdea, ContentPillar } from "@/types/database";

export function IdeaCard({
  idea,
  pillar,
  onEdit,
  onDelete,
  onAddToCalendar,
}: {
  idea: ContentIdea;
  pillar?: ContentPillar;
  onEdit: () => void;
  onDelete: () => void;
  onAddToCalendar: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-text-primary">{idea.title}</h3>
          {idea.source === "AI" && (
            <span title="AI-generated">
              <Sparkles className="h-4 w-4 shrink-0 text-constory-blue" aria-hidden="true" />
            </span>
          )}
        </div>
        {idea.description && <p className="flex-1 text-sm text-text-secondary">{idea.description}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {pillar && <Badge variant="blue">{pillar.name}</Badge>}
          {idea.status === "used" && <Badge variant="success">Used</Badge>}
          {idea.status === "archived" && <Badge>Archived</Badge>}
        </div>
        <div className="mt-auto flex items-center gap-1 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={onAddToCalendar} disabled={idea.status === "used"}>
            <CalendarPlus className="h-4 w-4" />
            Add to Calendar
          </Button>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${idea.title}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${idea.title}`}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
