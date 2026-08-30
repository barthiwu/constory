"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createCalendar,
  updateCalendar,
  deleteCalendar,
  duplicateCalendar,
  createPost,
  updatePost,
  movePost,
  duplicatePost,
  deletePost,
  type CreateCalendarInput,
  type CreatePostInput,
} from "@/services/calendar-service";

export interface ActionResult {
  error?: string;
}

export async function createCalendarAction(
  workspaceId: string,
  input: CreateCalendarInput,
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  try {
    const calendar = await createCalendar(supabase, workspaceId, input);
    revalidatePath("/app/calendars");
    return { id: calendar.id };
  } catch {
    return { error: "We couldn't create your calendar. Please try again." };
  }
}

export async function updateCalendarAction(calendarId: string, input: Partial<CreateCalendarInput>): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await updateCalendar(supabase, calendarId, input);
    revalidatePath(`/app/calendars/${calendarId}`);
    return {};
  } catch {
    return { error: "We couldn't save your changes. Please try again." };
  }
}

export async function deleteCalendarAction(calendarId: string): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await deleteCalendar(supabase, calendarId);
    revalidatePath("/app/calendars");
    return {};
  } catch {
    return { error: "We couldn't delete that calendar. Please try again." };
  }
}

export async function duplicateCalendarAction(workspaceId: string, calendarId: string): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  try {
    const copy = await duplicateCalendar(supabase, workspaceId, calendarId);
    revalidatePath("/app/calendars");
    return { id: copy.id };
  } catch {
    return { error: "We couldn't duplicate that calendar. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function createPostAction(calendarId: string, input: CreatePostInput): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  try {
    const post = await createPost(supabase, calendarId, input);
    revalidatePath(`/app/calendars/${calendarId}`);
    return { id: post.id };
  } catch {
    return { error: "We couldn't create that post. Please try again." };
  }
}

export async function updatePostAction(
  calendarId: string,
  postId: string,
  input: Partial<CreatePostInput>,
): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await updatePost(supabase, postId, input);
    revalidatePath(`/app/calendars/${calendarId}`);
    return {};
  } catch {
    return { error: "We couldn't save your changes. Please try again." };
  }
}

export async function movePostAction(calendarId: string, postId: string, newDate: string): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await movePost(supabase, postId, newDate);
    revalidatePath(`/app/calendars/${calendarId}`);
    return {};
  } catch {
    return { error: "We couldn't reschedule that post. Please try again." };
  }
}

export async function duplicatePostAction(calendarId: string, postId: string): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  try {
    const post = await duplicatePost(supabase, postId);
    revalidatePath(`/app/calendars/${calendarId}`);
    return { id: post.id };
  } catch {
    return { error: "We couldn't duplicate that post. Please try again." };
  }
}

export async function deletePostAction(calendarId: string, postId: string): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await deletePost(supabase, postId);
    revalidatePath(`/app/calendars/${calendarId}`);
    return {};
  } catch {
    return { error: "We couldn't delete that post. Please try again." };
  }
}
