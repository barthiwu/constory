"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/calendar/platform-icon";
import { getWeekDates } from "@/lib/calendar-grid";
import { formatDateShort } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { CalendarPost, ContentPillar } from "@/types/database";

export function WeekView({
  posts,
  pillars,
  anchorDate,
  onOpenPost,
}: {
  posts: CalendarPost[];
  pillars: ContentPillar[];
  anchorDate: string;
  onOpenPost: (post: CalendarPost) => void;
}) {
  const [anchor, setAnchor] = useState(anchorDate);
  const dates = useMemo(() => getWeekDates(anchor), [anchor]);
  const pillarById = new Map(pillars.map((p) => [p.id, p]));

  const postsByDate = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    posts.forEach((p) => {
      const list = map.get(p.scheduled_date) ?? [];
      list.push(p);
      map.set(p.scheduled_date, list);
    });
    return map;
  }, [posts]);

  function shiftWeek(delta: number) {
    const d = new Date(`${anchor}T00:00:00`);
    d.setDate(d.getDate() + delta * 7);
    setAnchor(d.toISOString().slice(0, 10));
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-text-primary">
          {formatDateShort(dates[0])} – {formatDateShort(dates[6])}
        </h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => shiftWeek(-1)} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => shiftWeek(1)} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-7">
        {dates.map((date) => {
          const dayPosts = postsByDate.get(date) ?? [];
          const isToday = date === todayISO;
          return (
            <div key={date} className="grid gap-2 rounded-lg border border-border bg-surface p-2">
              <div className={cn("text-xs font-medium", isToday ? "text-constory-blue" : "text-text-muted")}>{formatDateShort(date)}</div>
              <div className="grid gap-1.5">
                {dayPosts.map((post) => {
                  const pillar = post.content_pillar_id ? pillarById.get(post.content_pillar_id) : undefined;
                  return (
                    <button
                      key={post.id}
                      onClick={() => onOpenPost(post)}
                      className="grid gap-1 rounded-md border border-border bg-app-background p-2 text-left hover:border-constory-blue hover:bg-blue-light"
                    >
                      <div className="flex items-center gap-1.5">
                        <PlatformIcon platform={post.platform} />
                        <span className="truncate text-xs font-medium text-text-primary">{post.title}</span>
                      </div>
                      {pillar && (
                        <Badge variant="blue" className="w-fit text-[10px]">
                          {pillar.name}
                        </Badge>
                      )}
                    </button>
                  );
                })}
                {dayPosts.length === 0 && <p className="text-xs text-text-muted">No content</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
