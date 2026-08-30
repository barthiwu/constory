import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getBrandProfile } from "@/services/brand-service";
import { CreateCalendarWizard } from "@/components/calendar/create-calendar-wizard";

export const metadata: Metadata = { title: "New calendar — Constory" };

export default async function NewCalendarPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return null;

  const brandProfile = await getBrandProfile(supabase, workspace.id);

  return (
    <div className="mx-auto max-w-2xl">
      <CreateCalendarWizard workspaceId={workspace.id} defaultPlatforms={brandProfile?.selected_platforms ?? []} defaultGoal={brandProfile?.primary_goal ?? ""} />
    </div>
  );
}
