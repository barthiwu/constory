import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ContentCalendar, CalendarPost, PostStatus } from "@/types/database";

type DB = SupabaseClient<Database>;

/**
 * Server Actions are public POST endpoints: their TypeScript parameter types are not enforced at
 * runtime, so a forged request can carry extra keys. The services below used to spread caller input
 * straight into insert()/update(), which let a request override structural columns -- e.g.
 * `{ calendar_id: "<other calendar>" }` after `{ calendar_id: calendarId, ...input }` silently wins,
 * sidestepping the locked-workspace / plan-limit checks done against the *intended* parent. Only the
 * known editable columns are ever passed through now, and the parent id is applied last.
 */
function pickFields<T extends object>(input: T, allowed: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in input) out[key] = (input as Record<string, unknown>)[key];
  }
  return out as Partial<T>;
}

const CALENDAR_FIELDS = [
  "name",
  "start_date",
  "end_date",
  "posting_frequency",
  "selected_platforms",
  "primary_goal",
  "campaign_name",
  "campaign_objective",
  "campaign_start_date",
  "campaign_end_date",
  "campaign_message",
] as const;

const POST_FIELDS = [
  "content_pillar_id",
  "scheduled_date",
  "platform",
  "title",
  "format",
  "objective",
  "brief",
  "hook",
  "caption",
  "cta",
  "hashtags",
  "creative_direction",
  "status",
] as const;

export async function getCalendars(supabase: DB, workspaceId: string): Promise<ContentCalendar[]> {
  const { data, error } = await supabase
    .from("content_calendars")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCalendar(supabase: DB, calendarId: string): Promise<ContentCalendar | null> {
  const { data, error } = await supabase.from("content_calendars").select("*").eq("id", calendarId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface CreateCalendarInput {
  name: string;
  start_date: string;
  end_date: string;
  posting_frequency: number;
  selected_platforms: string[];
  primary_goal?: string | null;
  campaign_name?: string | null;
  campaign_objective?: string | null;
  campaign_start_date?: string | null;
  campaign_end_date?: string | null;
  campaign_message?: string | null;
}

export async function createCalendar(supabase: DB, workspaceId: string, input: CreateCalendarInput): Promise<ContentCalendar> {
  const { data, error } = await supabase
    .from("content_calendars")
    .insert({ ...pickFields(input, CALENDAR_FIELDS), workspace_id: workspaceId } as Database["public"]["Tables"]["content_calendars"]["Insert"])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateCalendar(
  supabase: DB,
  calendarId: string,
  input: Partial<CreateCalendarInput>,
): Promise<ContentCalendar> {
  const { data, error } = await supabase.from("content_calendars").update(pickFields(input, CALENDAR_FIELDS)).eq("id", calendarId).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteCalendar(supabase: DB, calendarId: string): Promise<void> {
  const { error } = await supabase.from("content_calendars").delete().eq("id", calendarId);
  if (error) throw error;
}

export async function duplicateCalendar(supabase: DB, workspaceId: string, calendarId: string): Promise<ContentCalendar> {
  const original = await getCalendar(supabase, calendarId);
  if (!original) throw new Error("Calendar not found");

  const copy = await createCalendar(supabase, workspaceId, {
    name: `${original.name} (Copy)`,
    start_date: original.start_date,
    end_date: original.end_date,
    posting_frequency: original.posting_frequency,
    selected_platforms: original.selected_platforms,
    primary_goal: original.primary_goal,
    campaign_name: original.campaign_name,
    campaign_objective: original.campaign_objective,
    campaign_start_date: original.campaign_start_date,
    campaign_end_date: original.campaign_end_date,
    campaign_message: original.campaign_message,
  });

  const posts = await getPosts(supabase, calendarId);
  if (posts.length > 0) {
    const { error } = await supabase.from("calendar_posts").insert(
      posts.map((p) => ({
        calendar_id: copy.id,
        content_pillar_id: p.content_pillar_id,
        scheduled_date: p.scheduled_date,
        platform: p.platform,
        title: p.title,
        format: p.format,
        objective: p.objective,
        brief: p.brief,
        hook: p.hook,
        caption: p.caption,
        cta: p.cta,
        hashtags: p.hashtags,
        creative_direction: p.creative_direction,
        status: "draft" as PostStatus,
      })),
    );
    if (error) throw error;
  }

  return copy;
}

// ---------------------------------------------------------------------------
// calendar_posts
// ---------------------------------------------------------------------------

export async function getPosts(supabase: DB, calendarId: string): Promise<CalendarPost[]> {
  const { data, error } = await supabase
    .from("calendar_posts")
    .select("*")
    .eq("calendar_id", calendarId)
    .order("scheduled_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPost(supabase: DB, postId: string): Promise<CalendarPost | null> {
  const { data, error } = await supabase.from("calendar_posts").select("*").eq("id", postId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface CreatePostInput {
  content_pillar_id?: string | null;
  scheduled_date: string;
  platform: string;
  title: string;
  format?: string | null;
  objective?: string | null;
  brief?: string | null;
  hook?: string | null;
  caption?: string | null;
  cta?: string | null;
  hashtags?: string[];
  creative_direction?: string | null;
  status?: PostStatus;
}

export async function createPost(supabase: DB, calendarId: string, input: CreatePostInput): Promise<CalendarPost> {
  const { data, error } = await supabase
    .from("calendar_posts")
    .insert({ ...pickFields(input, POST_FIELDS), calendar_id: calendarId } as Database["public"]["Tables"]["calendar_posts"]["Insert"])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function bulkCreatePosts(
  supabase: DB,
  calendarId: string,
  posts: CreatePostInput[],
): Promise<CalendarPost[]> {
  if (posts.length === 0) return [];
  const { data, error } = await supabase
    .from("calendar_posts")
    .insert(posts.map((p) => ({ ...pickFields(p, POST_FIELDS), calendar_id: calendarId }) as Database["public"]["Tables"]["calendar_posts"]["Insert"]))
    .select("*");
  if (error) throw error;
  return data ?? [];
}

export async function updatePost(supabase: DB, postId: string, input: Partial<CreatePostInput>): Promise<CalendarPost> {
  const { data, error } = await supabase.from("calendar_posts").update(pickFields(input, POST_FIELDS)).eq("id", postId).select("*").single();
  if (error) throw error;
  return data;
}

export async function duplicatePost(supabase: DB, postId: string): Promise<CalendarPost> {
  const original = await getPost(supabase, postId);
  if (!original) throw new Error("Post not found");

  return createPost(supabase, original.calendar_id, {
    content_pillar_id: original.content_pillar_id,
    scheduled_date: original.scheduled_date,
    platform: original.platform,
    title: `${original.title} (Copy)`,
    format: original.format,
    objective: original.objective,
    brief: original.brief,
    hook: original.hook,
    caption: original.caption,
    cta: original.cta,
    hashtags: original.hashtags,
    creative_direction: original.creative_direction,
    status: "draft",
  });
}

export async function deletePost(supabase: DB, postId: string): Promise<void> {
  const { error } = await supabase.from("calendar_posts").delete().eq("id", postId);
  if (error) throw error;
}
