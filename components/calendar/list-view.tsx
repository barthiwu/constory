"use client";

import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/calendar/platform-icon";
import { formatDate } from "@/lib/utils";
import { platformLabel } from "@/lib/constants";
import { EmptyState } from "@/components/layout/empty-state";
import { ListChecks } from "lucide-react";
import type { CalendarPost, ContentPillar, PostStatus } from "@/types/database";

const STATUS_VARIANT: Record<PostStatus, "default" | "blue" | "success"> = {
  draft: "default",
  planned: "blue",
  completed: "success",
};

export function ListView({
  posts,
  pillars,
  onOpenPost,
}: {
  posts: CalendarPost[];
  pillars: ContentPillar[];
  onOpenPost: (post: CalendarPost) => void;
}) {
  const pillarById = new Map(pillars.map((p) => [p.id, p]));
  const sorted = [...posts].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  if (sorted.length === 0) {
    return <EmptyState icon={ListChecks} title="No content yet" description="Generate or add content to see it listed here." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Platform</th>
            <th className="px-4 py-3">Pillar</th>
            <th className="px-4 py-3">Format</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((post) => {
            const pillar = post.content_pillar_id ? pillarById.get(post.content_pillar_id) : undefined;
            return (
              <tr
                key={post.id}
                onClick={() => onOpenPost(post)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-secondary"
              >
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDate(post.scheduled_date)}</td>
                <td className="px-4 py-3 font-medium text-text-primary">{post.title}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <PlatformIcon platform={post.platform} />
                    {platformLabel(post.platform)}
                  </span>
                </td>
                <td className="px-4 py-3">{pillar && <Badge variant="blue">{pillar.name}</Badge>}</td>
                <td className="px-4 py-3 text-text-secondary">{post.format ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[post.status]}>{post.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
