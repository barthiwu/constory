"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/calendar/platform-icon";
import { getMonthGridDates, WEEKDAY_LABELS } from "@/lib/calendar-grid";
import { cn } from "@/lib/utils";
import type { CalendarPost, ContentPillar } from "@/types/database";

const MAX_VISIBLE_PER_DAY = 3;

export function MonthView({
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
  const initial = new Date(`${anchorDate}T00:00:00`);
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const dates = useMemo(() => getMonthGridDates(year, month), [year, month]);
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

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-text-primary">{monthLabel}</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px] rounded-lg border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dates.map((date) => {
              const dayPosts = postsByDate.get(date) ?? [];
              const inMonth = new Date(`${date}T00:00:00`).getMonth() === month;
              const isToday = date === todayISO;
              return (
                <div
                  key={date}
                  className={cn(
                    "min-h-[100px] border-b border-r border-border p-1.5 last:border-r-0",
                    !inMonth && "bg-app-background/60",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                      isToday ? "bg-constory-blue font-semibold text-white" : "text-text-muted",
                      !inMonth && "opacity-50",
                    )}
                  >
                    {Number(date.slice(-2))}
                  </span>
                  <div className="grid gap-1">
                    {dayPosts.slice(0, MAX_VISIBLE_PER_DAY).map((post) => {
                      const pillar = post.content_pillar_id ? pillarById.get(post.content_pillar_id) : undefined;
                      return (
                        <button
                          key={post.id}
                          onClick={() => onOpenPost(post)}
                          title={pillar ? `${post.title} — ${pillar.name}` : post.title}
                          className="flex w-full items-center gap-1 rounded border border-border bg-app-background px-1.5 py-1 text-left text-xs hover:border-constory-blue hover:bg-blue-light"
                        >
                          <PlatformIcon platform={post.platform} />
                          <span className="flex-1 truncate text-text-primary">{post.title}</span>
                        </button>
                      );
                    })}
                    {dayPosts.length > MAX_VISIBLE_PER_DAY && (
                      <span className="text-[11px] text-text-muted">+{dayPosts.length - MAX_VISIBLE_PER_DAY} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
