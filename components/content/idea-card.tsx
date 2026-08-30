"use client";

import { Pencil, Trash2, CalendarPlus, Sparkles, Archive, RotateCcw, Copy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/constants";
import type { ContentIdea, ContentPillar, IdeaStatus } from "@/types/database";

const STATUS_LABEL: Record<IdeaStatus, string> = { active: "Active", used: "Used", archived: "Archived" };

export function IdeaCard({
  idea,
  pillar,
  onEdit,
  onDelete,
  onAddToCalendar,
  onStatusChange,
  onDuplicate,
}: {
  idea: ContentIdea;
  pillar?: ContentPillar;
  onEdit: () => void;
  onDelete: () => void;
  onAddToCalendar: () => void;
  onStatusChange: (status: IdeaStatus) => void;
  onDuplicate: () => void;
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
          <Badge variant={idea.status === "used" ? "success" : idea.status === "archived" ? "default" : "blue"}>
            {STATUS_LABEL[idea.status]}
          </Badge>
          {idea.recommended_platform && <Badge variant="outline">{platformLabel(idea.recommended_platform)}</Badge>}
          {idea.recommended_format && <Badge variant="outline">{idea.recommended_format}</Badge>}
          {idea.content_objective && <Badge variant="outline">{idea.content_objective}</Badge>}
        </div>
        {idea.suggested_hook && (
          <p className="text-xs italic text-text-muted">&ldquo;{idea.suggested_hook}&rdquo;</p>
        )}
        <div className="mt-auto flex items-center gap-1 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={onAddToCalendar} disabled={idea.status === "used"}>
            <CalendarPlus className="h-4 w-4" />
            Add to Calendar
          </Button>
          {idea.status === "archived" ? (
            <Button variant="ghost" size="icon" onClick={() => onStatusChange("active")} aria-label={`Restore ${idea.title}`} title="Restore to active">
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => onStatusChange("archived")} aria-label={`Archive ${idea.title}`} title="Archive">
              <Archive className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${idea.title}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDuplicate} aria-label={`Duplicate ${idea.title}`} title="Duplicate">
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${idea.title}`}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
