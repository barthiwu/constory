"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Lightbulb, Compass, Building2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY_LINKS = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/calendars", label: "Calendars", icon: CalendarDays },
  { href: "/app/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/app/strategy", label: "Strategy", icon: Compass },
  { href: "/app/brand", label: "Brand", icon: Building2 },
] as const;

const SECONDARY_LINKS = [{ href: "/app/settings", label: "Settings", icon: Settings }] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-blue-light text-blue-hover" : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
        collapsed && "justify-center px-2",
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col justify-between">
      <div className="grid gap-1">
        {PRIMARY_LINKS.map((link) => (
          <NavItem key={link.href} {...link} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="grid gap-1 border-t border-border pt-3">
        {SECONDARY_LINKS.map((link) => (
          <NavItem key={link.href} {...link} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
