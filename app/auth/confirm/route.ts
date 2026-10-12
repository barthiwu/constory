import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSafeConfirmNextPath } from "@/lib/redirect";

/**
 * Shared email-link confirmation handler: signup confirmation, password
 * reset, and any future Supabase auth email link that needs a session
 * established server-side. This MUST be a Route Handler, not a Server
 * Component page -- exchanging/verifying sets new session cookies, and
 * Next.js only allows `cookies().set()` to actually take effect from a
 * Server Action or Route Handler, never from a Server Component's render.
 *
 * This is exactly what broke the original password-reset implementation:
 * app/(auth)/reset-password/page.tsx used to call
 * `exchangeCodeForSession(code)` directly in the page component. The
 * exchange itself succeeded (so the page correctly showed the "set a new
 * password" form instead of "link expired"), but the resulting session
 * cookie was silently dropped -- lib/supabase/server.ts's `setAll` wraps
 * `cookieStore.set()` in a try/catch specifically because Server Components
 * throw when you try to set cookies during render, and that catch swallows
 * the failure. So by the time a form submitted a separate request, there
 * was no session cookie at all.
 *
 * Supabase auth links come in two shapes depending on project/template
 * config, so both are handled here:
 *   - `?code=...` -- PKCE-style, completed with `exchangeCodeForSession`.
 *   - `?token_hash=...&type=...` -- OTP-style, completed with `verifyOtp`;
 *     this is Supabase's now-recommended pattern for SSR apps and is what
 *     the "Confirm signup" email template should point at:
 *     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=...`
 * `next` is run through getSafeConfirmNextPath before use. Simply prefixing
 * the trusted `origin` is NOT enough: `next=@evil.com` produces
 * `https://constory.app@evil.com` (userinfo syntax -> evil.com) and
 * `next=.evil.com` produces a lookalike subdomain. Only an allowlist of
 * in-app paths is accepted; anything else falls back to /reset-password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = getSafeConfirmNextPath(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=invalid_link", origin));
}
