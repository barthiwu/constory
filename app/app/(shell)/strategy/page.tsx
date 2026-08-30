import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getStrategy, getPillars } from "@/services/strategy-service";
import { PageHeader } from "@/components/layout/page-header";
import { StrategyView } from "@/components/strategy/strategy-view";

export const metadata: Metadata = { title: "Strategy — Constory" };

export default async function StrategyPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return null;

  const strategy = await getStrategy(supabase, workspace.id);
  const pillars = strategy ? await getPillars(supabase, strategy.id) : [];

  return (
    <div className="grid gap-6">
      <PageHeader title="Strategy" description="Your content strategy and pillars — the foundation everything else is generated from." />
      <StrategyView workspaceId={workspace.id} strategy={strategy} pillars={pillars} />
    </div>
  );
}
