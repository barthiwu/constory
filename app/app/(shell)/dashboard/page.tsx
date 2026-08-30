import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, CalendarDays, Lightbulb, Compass, ArrowRight, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getBrandProfile } from "@/services/brand-service";
import { getStrategy } from "@/services/strategy-service";
import { getCalendars, getPosts } from "@/services/calendar-service";
import { getIdeas } from "@/services/content-service";
import { getPrimaryCta } from "@/lib/dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { PlatformIcon } from "@/components/calendar/platform-icon";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard — Constory" };

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle();

  const [brandProfile, strategy, calendars, ideas] = await Promise.all([
    getBrandProfile(supabase, workspace.id),
    getStrategy(supabase, workspace.id),
    getCalendars(supabase, workspace.id),
    getIdeas(supabase, workspace.id),
  ]);
  const activeCalendar = calendars[0] ?? null;
  const posts = activeCalendar ? await getPosts(supabase, activeCalendar.id) : [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = posts.filter((p) => p.scheduled_date >= today).slice(0, 5);
  const completedPosts = posts.filter((p) => p.status === "completed").length;
  const plannedPosts = posts.filter((p) => p.status === "planned").length;

  const firstName = profile?.full_name?.split(" ")[0];
  const brandComplete = !!brandProfile && brandProfile.business_description.trim().length > 0;

  // Primary CTA depends on how far along the workspace is — never gate on AI/OpenAI.
  const primaryCta = getPrimaryCta({
    brandComplete,
    hasStrategy: !!strategy,
    hasCalendar: calendars.length > 0,
    activeCalendarId: activeCalendar?.id ?? null,
  });

  const isBrandNewUser = !strategy && calendars.length === 0 && ideas.length === 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {firstName ? `${timeOfDayGreeting()}, ${firstName}` : timeOfDayGreeting()}
          </h1>
          <p className="text-sm text-text-secondary">Plan your content, organize your ideas, and keep your strategy moving forward.</p>
        </div>
        <Button asChild>
          <Link href={primaryCta.href}>
            <Sparkles className="h-4 w-4" />
            {primaryCta.label}
          </Link>
        </Button>
      </div>

      {isBrandNewUser ? (
        <EmptyState
          icon={Compass}
          title="Start by creating your content strategy"
          description="Constory will help you build the foundation for your content planning — your strategy shapes the pillars, ideas, and calendar that come after it."
          action={
            <Button asChild>
              <Link href="/app/strategy">
                <Sparkles className="h-4 w-4" />
                Create Strategy
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Current strategy</CardTitle>
                <CardDescription>Your content pillars and strategic direction.</CardDescription>
              </CardHeader>
              <CardContent>
                {strategy ? (
                  <div className="grid gap-3">
                    <p className="line-clamp-4 text-sm text-text-secondary">{strategy.strategy_summary}</p>
                    {strategy.monthly_theme && (
                      <p className="text-xs text-text-muted">
                        Theme: <span className="text-text-secondary">{strategy.monthly_theme}</span>
                      </p>
                    )}
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
                    description="Create a content strategy to unlock calendars and ideas."
                    action={
                      <Button asChild size="sm">
                        <Link href="/app/strategy">Create Strategy</Link>
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Content ideas</CardTitle>
                <CardDescription>Your library of potential content.</CardDescription>
              </CardHeader>
              <CardContent>
                {ideas.length > 0 ? (
                  <div className="grid gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-text-primary">{ideas.length}</span>
                      <span className="text-sm text-text-secondary">total ideas</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="blue">{ideas.filter((i) => i.status === "active").length} active</Badge>
                      <Badge variant="success">{ideas.filter((i) => i.status === "used").length} used</Badge>
                      <Badge>{ideas.filter((i) => i.status === "archived").length} archived</Badge>
                    </div>
                    <Button asChild variant="secondary" size="sm" className="justify-self-start">
                      <Link href="/app/ideas">
                        View ideas
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <EmptyState
                    icon={Lightbulb}
                    title="No ideas yet"
                    description="Start building a library of ideas you can use in future content."
                    action={
                      <Button asChild size="sm">
                        <Link href="/app/ideas">Add Idea</Link>
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
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="blue">{posts.length} posts</Badge>
                      {plannedPosts > 0 && <Badge>{plannedPosts} planned</Badge>}
                      {completedPosts > 0 && <Badge variant="success">{completedPosts} completed</Badge>}
                    </div>
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
                        <Link href="/app/calendars/new">Create Calendar</Link>
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
                      href={`/app/calendars/${activeCalendar!.id}?post=${post.id}`}
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
            <QuickAction href="/app/strategy" icon={Compass} label={strategy ? "Refine Strategy" : "Create Strategy"} />
            <QuickAction href="/app/calendars/new" icon={CalendarDays} label="Create Calendar" />
            <QuickAction href="/app/ideas" icon={Lightbulb} label="Add Idea" />
          </div>
        </>
      )}

      {!brandComplete && (
        <Card className="border-constory-blue/30 bg-blue-light/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-constory-blue" aria-hidden="true" />
              <p className="text-sm text-text-primary">Finish setting up your brand to get the most out of Constory.</p>
            </div>
            <Button asChild size="sm">
              <Link href="/app/onboarding">Complete Brand Setup</Link>
            </Button>
          </CardContent>
        </Card>
      )}
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
