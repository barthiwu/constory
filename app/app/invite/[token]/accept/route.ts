import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/services/workspace-service";
import { WORKSPACE_COOKIE } from "@/lib/workspace";

/**
 * Actually accepts a team invite — always reached with an authenticated
 * session already established (this path is under /app, which
 * lib/supabase/proxy.ts already requires a logged-in user for), either
 * because the visitor was already logged in as the invited address when
 * they clicked the invite link, or because they just came back from
 * /login or /signup with `redirectTo` pointing here (see
 * app/invite/[token]/page.tsx).
 *
 * A Route Handler, not a page: this needs to set the active-workspace
 * cookie on the way out, and Next.js only allows mutating cookies from a
 * Server Action or Route Handler — not from a plain Server Component's
 * render (confirmed live: a page.tsx version of this threw "Cookies can
 * only be modified in a Server Action or Route Handler"). Redirecting via
 * NextResponse.redirect with the cookie set directly on that response is
 * the correct shape for this.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const result = await acceptInvite(supabase, token);

  if (result.ok && result.workspaceId) {
    const response = NextResponse.redirect(new URL("/app?joined=1", request.url));
    response.cookies.set(WORKSPACE_COOKIE, result.workspaceId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return response;
  }

  // Anything that didn't succeed (not_found / expired / revoked / accepted /
  // email_mismatch) is explained on the public preview page instead of
  // duplicating that messaging here.
  return NextResponse.redirect(new URL(`/invite/${token}`, request.url));
}
