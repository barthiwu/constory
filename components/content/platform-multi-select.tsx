"use client";

import { ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { PLATFORM_OPTIONS, platformLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * A dropdown-style trigger (looks like <Select>) that opens a checkbox list
 * instead of a single-choice list — used everywhere an idea/post's
 * platform(s) are picked, since a single business's content routinely
 * targets more than one platform at once. Shared by idea-dialog.tsx,
 * ideas-view.tsx's generated-idea review grid, and add-to-calendar-dialog.tsx
 * so the interaction is consistent wherever platforms are chosen.
 */
export function PlatformMultiSelect({
  value,
  onChange,
  options = PLATFORM_OPTIONS,
  placeholder = "None",
  triggerClassName,
  ariaLabel,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  function toggle(p: string, checked: boolean) {
    onChange(checked ? [...value, p] : value.filter((x) => x !== p));
  }

  const summary = value.length === 0 ? placeholder : value.length <= 2 ? value.map(platformLabel).join(", ") : `${value.length} platforms`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? "Platforms"}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary",
            value.length === 0 && "text-text-muted",
            triggerClassName,
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        <div className="grid gap-0.5">
          {options.map((p) => (
            <label key={p.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text-primary hover:bg-surface-secondary">
              <Checkbox checked={value.includes(p.value)} onCheckedChange={(c) => toggle(p.value, c === true)} />
              {p.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
