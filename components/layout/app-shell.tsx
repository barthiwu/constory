"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLinks } from "@/components/layout/nav-links";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceSummary } from "@/services/workspace-service";

const COLLAPSE_KEY = "constory:sidebar-collapsed";

interface AppShellProps {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  profile: { fullName: string | null; email: string | null; avatarUrl: string | null };
  children: React.ReactNode;
}

export function AppShell({ workspaces, activeWorkspaceId, profile, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Reading localStorage (a browser-only API) to hydrate initial state must
    // happen post-mount to avoid an SSR/client markup mismatch, so this
    // one-time setState-on-mount is intentional rather than the "derive
    // during render" pattern used elsewhere in this file.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // localStorage unavailable (private browsing, etc.) — default to expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const sidebarInner = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className={cn("flex items-center gap-2", collapsed && !onNavigate && "justify-center")}>
        <Link href="/app/dashboard" className="text-lg font-semibold tracking-tight text-constory-black">
          {collapsed && !onNavigate ? "C" : "Constory"}
        </Link>
      </div>
      <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} collapsed={collapsed && !onNavigate} />
      <NavLinks collapsed={collapsed && !onNavigate} onNavigate={onNavigate} />
      <div className="border-t border-border pt-3">
        <UserMenu {...profile} collapsed={collapsed && !onNavigate} />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-app-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden shrink-0 border-r border-border bg-surface transition-[width] duration-150 md:block",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        {sidebarInner()}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-sm hover:text-text-primary"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:min-w-0">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {sidebarInner(() => setMobileOpen(false))}
            </SheetContent>
          </Sheet>
          <Link href="/app/dashboard" className="text-base font-semibold tracking-tight text-constory-black">
            Constory
          </Link>
          <div className="w-9" aria-hidden="true" />
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
