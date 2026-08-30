import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, CalendarDays, Lightbulb, Compass, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getStrategy } from "@/services/strategy-service";
import { getCalendars, getPosts } from "@/services/calendar-service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { PlatformIcon } from "@/components/calendar/platform-icon";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard — Constory" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle();

  const [strategy, calendars] = await Promise.all([getStrategy(supabase, workspace.id), getCalendars(supabase, workspace.id)]);
  const activeCalendar = calendars[0] ?? null;
  const posts = activeCalendar ? await getPosts(supabase, activeCalendar.id) : [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = posts.filter((p) => p.scheduled_date >= today).slice(0, 5);

  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="text-sm text-text-secondary">Here&apos;s what&apos;s happening in {workspace.name}.</p>
        </div>
        <Button asChild>
          <Link href="/app/calendars/new">
            <Sparkles className="h-4 w-4" />
            Generate Calendar
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current strategy</CardTitle>
            <CardDescription>Your content pillars and strategic direction.</CardDescription>
          </CardHeader>
          <CardContent>
            {strategy ? (
              <div className="grid gap-3">
                <p className="line-clamp-4 text-sm text-text-secondary">{strategy.strategy_summary}</p>
                <Button asChild variant="secondary" size="sm" className="justify-self-start">
                  <Link href="/app/strategy">
                    View strategy
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={Compass}
                title="No strategy yet"
                description="Generate a content strategy to unlock calendars and ideas."
                action={
                  <Button asChild size="sm">
                    <Link href="/app/strategy">Generate Strategy</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active calendar</CardTitle>
            <CardDescription>Your most recently created calendar.</CardDescription>
          </CardHeader>
          <CardContent>
            {activeCalendar ? (
              <div className="grid gap-3">
                <div>
                  <p className="font-medium text-text-primary">{activeCalendar.name}</p>
                  <p className="text-sm text-text-secondary">
                    {formatDate(activeCalendar.start_date)} – {formatDate(activeCalendar.end_date)}
                  </p>
                </div>
                <Badge variant="blue" className="w-fit">
                  {posts.length} posts
                </Badge>
                <Button asChild variant="secondary" size="sm" className="justify-self-start">
                  <Link href={`/app/calendars/${activeCalendar.id}`}>
                    Open calendar
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No calendar yet"
                description="Start planning your next month of content."
                action={
                  <Button asChild size="sm">
                    <Link href="/app/calendars/new">Generate Calendar</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming content</CardTitle>
          <CardDescription>What&apos;s next on your active calendar.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-text-secondary">Nothing scheduled yet.</p>
          ) : (
            <div className="grid gap-2">
              {upcoming.map((post) => (
                <Link
                  key={post.id}
                  href={`/app/calendars/${activeCalendar!.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3 hover:bg-surface-secondary"
                >
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={post.platform} />
                    <span className="text-sm font-medium text-text-primary">{post.title}</span>
                  </div>
                  <span className="text-xs text-text-muted">{formatDate(post.scheduled_date)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickAction href="/app/strategy" icon={Compass} label="Generate Strategy" />
        <QuickAction href="/app/calendars/new" icon={CalendarDays} label="Generate Calendar" />
        <QuickAction href="/app/ideas" icon={Lightbulb} label="Add Idea" />
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-constory-blue hover:bg-blue-light"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-light text-constory-blue">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium text-text-primary">{label}</span>
    </Link>
  );
}
