"use client";

import { useRef, useState } from "react";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { PlatformIcon } from "@/components/calendar/platform-icon";
import { Badge } from "@/components/ui/badge";
import type { CalendarPost, ContentPillar } from "@/types/database";

/**
 * Wraps a calendar post pill/card so hovering it shows a proper preview of
 * the full post -- title, platform/pillar/format, and whatever's actually
 * been written (brief/hook/caption) -- instead of relying on the native
 * `title` attribute, whose browser-default tooltip renders as an unstyled
 * box (and can appear as blank space depending on browser/OS) rather than
 * anything resembling the app.
 *
 * Built on the existing Popover (Radix) primitive, driven by hover state
 * instead of click: `open` is controlled locally, with a short close delay
 * so moving the pointer from the trigger onto the popover itself (to read a
 * long caption) doesn't immediately dismiss it.
 */
export function PostHoverPreview({
  post,
  pillar,
  children,
}: {
  post: CalendarPost;
  pillar?: ContentPillar;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 100);
  }

  const writeUp = [post.brief, post.hook, post.caption].some(Boolean);

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div onMouseEnter={openNow} onMouseLeave={closeSoon}>
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-80 max-w-[calc(100vw-2rem)]"
      >
        <div className="grid gap-2">
          <div className="flex items-center gap-1.5">
            <PlatformIcon platform={post.platform} />
            <p className="min-w-0 flex-1 text-sm font-semibold text-text-primary">{post.title}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pillar && (
              <Badge variant="blue" className="max-w-full">
                <span className="min-w-0 truncate">{pillar.name}</span>
              </Badge>
            )}
            {post.format && <Badge variant="default">{post.format}</Badge>}
          </div>
          {writeUp ? (
            <div className="grid gap-1.5 text-sm text-text-secondary">
              {post.brief && <p>{post.brief}</p>}
              {post.hook && <p className="italic">&ldquo;{post.hook}&rdquo;</p>}
              {post.caption && <p className="whitespace-pre-wrap">{post.caption}</p>}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No brief, hook, or caption written yet.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
