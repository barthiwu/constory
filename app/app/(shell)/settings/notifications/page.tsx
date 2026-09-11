import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getNotificationPreferences } from "@/services/notification-service";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { NotificationPreferencesView } from "@/components/notifications/notification-preferences-view";

export const metadata: Metadata = { title: "Notifications — Constory" };

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const preferences = await getNotificationPreferences(supabase, user.id);

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Manage your profile, workspace, and account." />
      <SettingsNav />
      <NotificationPreferencesView preferences={preferences} />
    </div>
  );
}
