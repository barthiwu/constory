import { NextResponse } from "next/server";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { supportReplySchema } from "@/lib/support/schemas";
import { faqContextBlock } from "@/lib/support/faq";
import { buildWhatsAppLink } from "@/lib/support/whatsapp";
import { supportChatStartedEmail } from "@/lib/notifications/templates";
import { sendEmail } from "@/lib/notifications/email";
import { createChat, getChat, addMessage, listMessages, markEscalated, claimNotification } from "@/services/support-service";

const bodySchema = z.object({
  chatId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
  pagePath: z.string().max(300).optional(),
});

const SYSTEM_PROMPT = `You are Constory's support assistant, chatting live with a visitor or signed-in user through the app's floating support widget.

Rules:
- Answer only using the product information given below. Never invent a feature, price, policy, or timeline that isn't stated there.
- Keep replies short and conversational -- a few sentences at most, like a real chat message, never an essay.
- Be warm and direct. Don't over-apologize or use corporate boilerplate.
- Set needs_human to true (and keep your reply short, just acknowledging you're connecting them with the team) whenever: the question is about their specific account, billing, or data that only a person with account access could resolve; they explicitly ask for a human or say this isn't helping; or the answer genuinely isn't covered by the product information given below.
- Never ask for or accept a password, card number, or other credential in this chat.
- Respond only with the structured output requested.`;

/** Last N turns sent to the model — enough context for a real conversation without unbounded token growth. */
const HISTORY_LIMIT = 20;

function whatsappLinkFor(lastUserMessage: string): string | null {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER;
  if (!number) return null;
  return buildWhatsAppLink(number, `Hi, I need help with Constory. ${lastUserMessage}`.slice(0, 500));
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { message, pagePath } = parsed.data;

  const admin = createAdminClient();

  // Best-effort identity: a signed-in user gets tagged on the chat for
  // context, but the widget works the same for a signed-out visitor (see
  // migration 0026's file header).
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not signed in / no session — proceed as an anonymous visitor.
  }

  let chatId = parsed.data.chatId ?? null;
  let isNewChat = false;

  try {
    if (chatId) {
      const existing = await getChat(admin, chatId);
      if (!existing) {
        chatId = null; // Stale/invalid chatId from the client — start fresh rather than 404ing the widget.
      }
    }
    if (!chatId) {
      const chat = await createChat(admin, { userId, workspaceId: null, pagePath: pagePath ?? null });
      chatId = chat.id;
      isNewChat = true;
    }

    await addMessage(admin, chatId, "user", message);
  } catch (err) {
    console.error("[support/chat] failed to persist the incoming message:", err);
    return NextResponse.json({ error: "We couldn't send that right now. Please try again." }, { status: 500 });
  }

  // Fire the "a chat started" notification exactly once per chat, and never
  // let it block or fail the actual reply — see claimNotification's comment
  // for the race-safety, and lib/notifications/email.ts for how a missing
  // RESEND_API_KEY degrades to a no-op instead of throwing.
  if (isNewChat) {
    claimNotification(admin, chatId)
      .then((claimed) => {
        if (!claimed) return;
        const to = process.env.SUPPORT_NOTIFICATION_EMAIL;
        if (!to) return;
        const { subject, html } = supportChatStartedEmail({
          identity: userId ? `Signed-in user (${userId})` : "Anonymous visitor",
          firstMessage: message,
          pagePath: pagePath ?? null,
          chatId: chatId!,
        });
        return sendEmail({ to, subject, html });
      })
      .catch((err) => console.error("[support/chat] notification email failed:", err));
  }

  const whatsappLink = whatsappLinkFor(message);

  try {
    const history = await listMessages(admin, chatId);
    const recent = history.slice(-HISTORY_LIMIT);

    const client = getOpenAIClient();
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_FAST,
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\nToday's date: ${today}.\n\nProduct information:\n${faqContextBlock()}`,
        },
        ...recent.map((m) => ({ role: m.role, content: m.content }) as const),
      ],
      response_format: zodResponseFormat(supportReplySchema, "support_reply"),
      temperature: 0.4,
    });

    const result = completion.choices[0]?.message?.parsed;
    if (!result) throw new Error("The AI didn't return a usable reply.");

    await addMessage(admin, chatId, "assistant", result.reply);
    if (result.needs_human) await markEscalated(admin, chatId);

    return NextResponse.json({
      chatId,
      reply: result.reply,
      needsHuman: result.needs_human,
      whatsappLink: result.needs_human ? whatsappLink : null,
    });
  } catch (err) {
    console.error("[support/chat] AI reply failed, falling back to a direct handoff:", err);
    const fallbackReply = whatsappLink
      ? "Sorry, I'm having trouble responding right now — tap below to reach us directly on WhatsApp."
      : "Sorry, I'm having trouble responding right now. Please try again in a moment.";
    try {
      await addMessage(admin, chatId, "assistant", fallbackReply);
      await markEscalated(admin, chatId);
    } catch (persistErr) {
      console.error("[support/chat] failed to persist the fallback reply:", persistErr);
    }
    return NextResponse.json({ chatId, reply: fallbackReply, needsHuman: true, whatsappLink });
  }
}
