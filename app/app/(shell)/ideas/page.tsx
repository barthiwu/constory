import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getIdeas } from "@/services/content-service";
import { getStrategy, getPillars } from "@/services/strategy-service";
import { getCalendars } from "@/services/calendar-service";
import { PageHeader } from "@/components/layout/page-header";
import { IdeasView } from "@/components/content/ideas-view";

export const metadata: Metadata = { title: "Content Ideas — Constory" };

export default async function IdeasPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return null;

  const [ideas, strategy, calendars] = await Promise.all([
    getIdeas(supabase, workspace.id),
    getStrategy(supabase, workspace.id),
    getCalendars(supabase, workspace.id),
  ]);
  const pillars = strategy ? await getPillars(supabase, strategy.id) : [];

  return (
    <div className="grid gap-6">
      <PageHeader title="Content Ideas" description="Every great content plan starts with an idea." />
      <IdeasView workspaceId={workspace.id} ideas={ideas} pillars={pillars} calendars={calendars} />
    </div>
  );
}
