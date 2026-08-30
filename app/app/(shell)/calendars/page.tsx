import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getCalendars, getPosts } from "@/services/calendar-service";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { platformLabel as pLabel } from "@/lib/constants";

export const metadata: Metadata = { title: "Calendars — Constory" };

export default async function CalendarsPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return null;

  const calendars = await getCalendars(supabase, workspace.id);
  const counts = await Promise.all(calendars.map((c) => getPosts(supabase, c.id).then((posts) => posts.length)));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Calendars"
        description="Plan, generate, and manage your content calendars."
        actions={
          <Button asChild>
            <Link href="/app/calendars/new">
              <Plus className="h-4 w-4" />
              New Calendar
            </Link>
          </Button>
        }
      />

      {calendars.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Start planning your next month of content"
          description="Create a calendar, then let Constory generate a full month of content around it."
          action={
            <Button asChild>
              <Link href="/app/calendars/new">
                <Plus className="h-4 w-4" />
                New Calendar
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {calendars.map((c, i) => (
            <Link key={c.id} href={`/app/calendars/${c.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <CardDescription>
                    {formatDate(c.start_date)} – {formatDate(c.end_date)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="blue">{counts[i]} posts</Badge>
                  {c.selected_platforms.slice(0, 3).map((p) => (
                    <Badge key={p}>{pLabel(p)}</Badge>
                  ))}
                  {c.selected_platforms.length > 3 && <Badge>+{c.selected_platforms.length - 3}</Badge>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
