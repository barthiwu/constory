import { cn } from "@/lib/utils";
import { platformLabel, PLATFORM_BG_CLASS } from "@/lib/constants";

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const label = platformLabel(platform);
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold leading-none text-white",
        PLATFORM_BG_CLASS[platform] ?? PLATFORM_BG_CLASS.other,
        className,
      )}
      title={label}
    >
      {/* The colored letter badge is decorative — every place this renders
          sits next to a post title with no other text naming the platform
          (a month/week calendar cell, the list view, dashboard's upcoming
          list), so without this a screen reader user has no way to tell
          which platform a post targets (Phase 7 spec section 26: don't rely
          on color alone, keep semantics screen-reader-friendly). */}
      <span aria-hidden="true">{label.charAt(0)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
