import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, getWorkspaceMembers, getPendingInvites } from "@/services/workspace-service";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { TeamView } from "@/components/layout/team-view";

export const metadata: Metadata = { title: "Team — Constory" };

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspace = await getCurrentWorkspace(supabase);
  if (!user || !workspace) return null;

  const [members, invites] = await Promise.all([
    getWorkspaceMembers(supabase, workspace.id, user.id),
    workspace.role === "owner" || workspace.role === "admin" ? getPendingInvites(supabase, workspace.id) : Promise.resolve([]),
  ]);

  const canManage = workspace.role === "owner" || workspace.role === "admin";

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Manage your profile, workspace, and account." />
      <SettingsNav />
      <TeamView members={members} invites={invites} canManage={canManage} />
    </div>
  );
}
