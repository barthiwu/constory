import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email-link confirmation handler (currently just password reset). This
 * MUST be a Route Handler, not a Server Component page — exchanging the
 * code sets new session cookies, and Next.js only allows `cookies().set()`
 * to actually take effect from a Server Action or Route Handler, never from
 * a Server Component's render.
 *
 * This is exactly what broke the previous implementation: app/(auth)/reset-password/page.tsx
 * used to call `exchangeCodeForSession(code)` directly in the page component.
 * The exchange itself succeeded (so the page correctly showed the "set a
 * new password" form instead of "link expired"), but the resulting session
 * cookie was silently dropped -- lib/supabase/server.ts's `setAll` wraps
 * `cookieStore.set()` in a try/catch specifically because Server Components
 * throw when you try to set cookies during render, and that catch swallows
 * the failure. So by the time the form submitted to resetPasswordAction
 * (a separate request), there was no session cookie at all, and
 * `supabase.auth.updateUser()` failed with "Auth session missing!".
 *
 * Routing the exchange through here instead means `cookieStore.set()` is
 * called from a Route Handler, where it actually succeeds, and the
 * `NextResponse.redirect()` below carries the new session cookie back to
 * the browser correctly.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/reset-password";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/reset-password?error=invalid_link`);
}
