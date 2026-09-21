import { createAdminClient } from "@/lib/supabase/server";
import type { SupportChat, SupportMessage, SupportMessageRole } from "@/types/database";

type AdminDB = ReturnType<typeof createAdminClient>;

/**
 * All support-chat reads/writes go through the service-role (admin) client,
 * never the session-scoped one — see the file header on migration
 * 0026_support_chat.sql for why (a signed-out visitor can use this widget,
 * so there's no session to scope a query to). Every function here takes an
 * already-constructed admin client rather than creating its own, so
 * app/api/support/chat/route.ts creates exactly one per request.
 */

export async function createChat(
  admin: AdminDB,
  input: { userId: string | null; workspaceId: string | null; pagePath: string | null },
): Promise<SupportChat> {
  const { data, error } = await admin
    .from("support_chats")
    .insert({ user_id: input.userId, workspace_id: input.workspaceId, page_path: input.pagePath })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getChat(admin: AdminDB, chatId: string): Promise<SupportChat | null> {
  const { data, error } = await admin.from("support_chats").select("*").eq("id", chatId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMessages(admin: AdminDB, chatId: string): Promise<SupportMessage[]> {
  const { data, error } = await admin
    .from("support_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function addMessage(
  admin: AdminDB,
  chatId: string,
  role: SupportMessageRole,
  content: string,
): Promise<SupportMessage> {
  const { data, error } = await admin
    .from("support_messages")
    .insert({ chat_id: chatId, role, content })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Marks a chat escalated (the AI handed off to a human) — informational only, doesn't gate anything. */
export async function markEscalated(admin: AdminDB, chatId: string): Promise<void> {
  const { error } = await admin
    .from("support_chats")
    .update({ status: "escalated", updated_at: new Date().toISOString() })
    .eq("id", chatId);
  if (error) throw error;
}

/**
 * Atomically claims the "send the new-chat notification" job for a chat —
 * only the caller that successfully flips notified_at from null gets true
 * back, so a retried request (or a race between two requests for the same
 * brand-new chat) can never send the email twice.
 */
export async function claimNotification(admin: AdminDB, chatId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("support_chats")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", chatId)
    .is("notified_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
