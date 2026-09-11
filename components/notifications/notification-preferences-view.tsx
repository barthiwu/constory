"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { updateNotificationPreferenceAction } from "@/app/app/(shell)/settings/notifications/actions";
import type { NotificationPreferences } from "@/types/database";

type PreferenceKey = keyof Omit<NotificationPreferences, "user_id" | "created_at" | "updated_at">;

const ROWS: { category: string; description: string; emailKey: PreferenceKey; inAppKey: PreferenceKey }[] = [
  {
    category: "Low AI credits",
    description: "When your account is running low on AI credits for the current period.",
    emailKey: "email_low_credits",
    inAppKey: "inapp_low_credits",
  },
  {
    category: "Scheduled post reminders",
    description: "A heads-up before a planned post's scheduled date arrives.",
    emailKey: "email_scheduled_posts",
    inAppKey: "inapp_scheduled_posts",
  },
  {
    category: "Weekly digest",
    description: "A weekly summary of activity across your workspace.",
    emailKey: "email_weekly_digest",
    inAppKey: "inapp_weekly_digest",
  },
];

export function NotificationPreferencesView({ preferences }: { preferences: NotificationPreferences }) {
  const { toast } = useToast();
  const [values, setValues] = useState(preferences);
  const [, startTransition] = useTransition();

  function handleToggle(key: PreferenceKey, next: boolean) {
    setValues((prev) => ({ ...prev, [key]: next }));
    startTransition(async () => {
      const result = await updateNotificationPreferenceAction(key, next);
      if (result?.error) {
        setValues((prev) => ({ ...prev, [key]: !next }));
        toast({ title: "Couldn't save", description: result.error, variant: "error" });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose what Constory notifies you about, and where.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1">
          <span />
          <span className="text-center text-xs font-medium uppercase tracking-wide text-text-muted">Email</span>
          <span className="text-center text-xs font-medium uppercase tracking-wide text-text-muted">In-app</span>

          {ROWS.map((row) => (
            <div key={row.category} className="contents">
              <div className="border-t border-border py-4">
                <p className="text-sm font-medium text-text-primary">{row.category}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{row.description}</p>
              </div>
              <div className="flex items-center justify-center border-t border-border py-4">
                <Switch checked={values[row.emailKey]} onCheckedChange={(v) => handleToggle(row.emailKey, v)} aria-label={`Email — ${row.category}`} />
              </div>
              <div className="flex items-center justify-center border-t border-border py-4">
                <Switch checked={values[row.inAppKey]} onCheckedChange={(v) => handleToggle(row.inAppKey, v)} aria-label={`In-app — ${row.category}`} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
