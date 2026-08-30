import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/constants";

// lucide-react no longer ships brand/logo icons, so platforms are shown as a
// small colored initial badge instead of a brand mark — still scannable at a
// glance in a crowded calendar cell without depending on trademarked logos.
const COLORS: Record<string, string> = {
  instagram: "bg-[#E1306C]",
  facebook: "bg-[#1877F2]",
  linkedin: "bg-[#0A66C2]",
  tiktok: "bg-constory-black",
  x: "bg-constory-black",
  other: "bg-text-muted",
};

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const label = platformLabel(platform);
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold leading-none text-white",
        COLORS[platform] ?? COLORS.other,
        className,
      )}
      title={label}
      aria-hidden="true"
    >
      {label.charAt(0)}
    </span>
  );
}
