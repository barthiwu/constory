"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app/settings", label: "Account" },
  { href: "/app/settings/billing", label: "Billing" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="inline-flex h-10 items-center gap-1 rounded-md bg-surface-secondary p-1 text-text-secondary">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-surface text-text-primary shadow-sm" : "hover:text-text-primary",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
