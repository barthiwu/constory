import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/layout/settings-view";
import { SettingsNav } from "@/components/layout/settings-nav";

export const metadata: Metadata = { title: "Settings — Constory" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !workspace) return null;

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Manage your profile, workspace, and account." />
      <SettingsNav />
      <SettingsView
        fullName={profile?.full_name ?? ""}
        email={user.email ?? ""}
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        workspaceDescription={workspace.description ?? ""}
      />
    </div>
  );
}
