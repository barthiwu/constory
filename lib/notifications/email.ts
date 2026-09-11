// Thin wrapper around Resend's HTTP API for the three system-generated
// notification emails (low credits, scheduled-post reminders, weekly
// digest). Talks to Resend directly over `fetch` rather than pulling in
// their SDK — that keeps this dependency-free (no `npm install` needed for
// the build to succeed, which matters in sandboxed/CI environments with
// restricted package-registry access) and the API surface used here is
// tiny. Mirrors the ManualBillingProvider fallback pattern in
// lib/billing/provider.ts: with no RESEND_API_KEY set, sends are skipped
// with a console warning instead of throwing, so the app and its cron
// routes keep working in any environment that hasn't configured a real
// email provider yet.
//
// Setup (when ready to send real email): add RESEND_API_KEY to .env.local
// (and your deploy target's env), and verify a sending domain in Resend so
// RESEND_FROM_EMAIL's domain is authenticated — otherwise Resend will only
// deliver to your own account's verified test address.

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Falls back to a naive HTML-stripped version of `html` if omitted. */
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  /** Present when `sent` is false — "not_configured" or the provider's error message. */
  error?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[notifications/email] RESEND_API_KEY not set — skipping "${input.subject}" to ${input.to}.`);
    return { sent: false, error: "not_configured" };
  }

  const from = process.env.RESEND_FROM_EMAIL || "Constory <notifications@constory.app>";

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text ?? stripHtml(input.html),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[notifications/email] Resend rejected the send (${response.status}):`, detail);
      return { sent: false, error: `resend_${response.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[notifications/email] Resend send threw:", err);
    return { sent: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}
