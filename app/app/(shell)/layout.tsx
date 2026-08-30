import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces, getCurrentWorkspace } from "@/services/workspace-service";
import { AppShell } from "@/components/layout/app-shell";

export default async function ProtectedAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already guards /app, but Server Components should never assume
  // that upstream check ran — verify authorization again here.
  if (!user) redirect("/login");

  const workspaces = await getUserWorkspaces(supabase);
  const active = await getCurrentWorkspace(supabase);

  if (!active) {
    redirect("/app/onboarding");
  }

  const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle();

  return (
    <AppShell
      workspaces={workspaces}
      activeWorkspaceId={active.id}
      profile={{ fullName: profile?.full_name ?? null, email: user.email ?? null, avatarUrl: profile?.avatar_url ?? null }}
    >
      {children}
    </AppShell>
  );
}
