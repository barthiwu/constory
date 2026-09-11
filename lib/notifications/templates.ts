// Plain, inline-styled HTML email templates (no external CSS — required for
// reliable rendering across email clients). Kept intentionally simple: one
// shared wrapper plus one builder per notification type.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://constory.app";
const BRAND_BLUE = "#168bff";

function wrapper(preheader: string, bodyHtml: string, ctaHref: string, ctaLabel: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#eef0f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <span style="display:none;font-size:1px;color:#eef0f3;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #dfe2e8;">
                <span style="font-size:20px;font-weight:600;color:${BRAND_BLUE};">Constory</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#111827;font-size:15px;line-height:1.6;">
                ${bodyHtml}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                  <tr>
                    <td style="border-radius:8px;background:${BRAND_BLUE};">
                      <a href="${ctaHref}" style="display:inline-block;padding:10px 20px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #dfe2e8;color:#98a2b3;font-size:12px;">
                You're receiving this because it's enabled in your Constory notification settings.
                <a href="${APP_URL}/app/settings" style="color:#98a2b3;">Manage preferences</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function lowCreditsEmail(input: { name: string; remaining: number; allowance: number }): { subject: string; html: string } {
  const subject = `You're running low on AI credits (${input.remaining} left)`;
  const html = wrapper(
    subject,
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(input.name)},</p>
     <p style="margin:0 0 12px;">You've used most of this period's AI credits — <strong>${input.remaining} of ${input.allowance}</strong> remain. Once they run out, AI generation and regeneration will pause until your credits reset next period (or you upgrade your plan).</p>`,
    `${APP_URL}/app/settings/billing`,
    "Review your plan",
  );
  return { subject, html };
}

export function scheduledPostReminderEmail(input: { name: string; postTitle: string; platform: string; scheduledDate: string; calendarUrl: string }): { subject: string; html: string } {
  const subject = `Reminder: "${input.postTitle}" is scheduled soon`;
  const html = wrapper(
    subject,
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(input.name)},</p>
     <p style="margin:0 0 12px;">Your post <strong>${escapeHtml(input.postTitle)}</strong> for <strong>${escapeHtml(input.platform)}</strong> is scheduled for <strong>${escapeHtml(input.scheduledDate)}</strong>. Make sure it's ready to publish.</p>`,
    input.calendarUrl,
    "Open calendar",
  );
  return { subject, html };
}

export function weeklyDigestEmail(input: {
  name: string;
  workspaceName: string;
  postsPublishedLastWeek: number;
  postsScheduledThisWeek: number;
  creditsUsedLastWeek: number;
  ideasReady: number;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const subject = `Your weekly Constory digest — ${input.workspaceName}`;
  const html = wrapper(
    subject,
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(input.name)},</p>
     <p style="margin:0 0 16px;">Here's what happened in <strong>${escapeHtml(input.workspaceName)}</strong> this past week:</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
       <tr><td style="padding:6px 0;color:#667085;">Posts completed</td><td style="padding:6px 0;text-align:right;font-weight:600;">${input.postsPublishedLastWeek}</td></tr>
       <tr><td style="padding:6px 0;color:#667085;">Posts scheduled this week</td><td style="padding:6px 0;text-align:right;font-weight:600;">${input.postsScheduledThisWeek}</td></tr>
       <tr><td style="padding:6px 0;color:#667085;">AI credits used</td><td style="padding:6px 0;text-align:right;font-weight:600;">${input.creditsUsedLastWeek}</td></tr>
       <tr><td style="padding:6px 0;color:#667085;">Ideas ready to plan</td><td style="padding:6px 0;text-align:right;font-weight:600;">${input.ideasReady}</td></tr>
     </table>`,
    input.dashboardUrl,
    "Open dashboard",
  );
  return { subject, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
