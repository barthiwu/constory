"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchWorkspaceAction } from "@/app/app/actions";
import type { WorkspaceSummary } from "@/services/workspace-service";
import { cn } from "@/lib/utils";
import { CreateWorkspaceDialog } from "@/components/layout/create-workspace-dialog";
import { useToast } from "@/components/ui/toast";

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  collapsed,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  function handleSwitch(id: string) {
    if (id === activeWorkspaceId) return;
    startTransition(async () => {
      const result = await switchWorkspaceAction(id);
      if (!result.ok) {
        toast({ title: "Couldn't switch workspace", description: result.error, variant: "error" });
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isPending}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:opacity-60",
              collapsed && "justify-center px-0",
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-constory-blue text-xs font-semibold text-white">
              {active?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
            {!collapsed && (
              <>
                <span className="flex-1 truncate">{active?.name ?? "Select workspace"}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => handleSwitch(w.id)} className="justify-between">
              <span className="truncate">{w.name}</span>
              {w.id === activeWorkspaceId && <Check className="h-4 w-4 text-constory-blue" aria-hidden="true" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
