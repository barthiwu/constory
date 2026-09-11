import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and redirects unauthenticated
 * users away from the protected /app area. Called from the root proxy.ts.
 */
export async function updateSession(request: NextRequest) {
  const { pathname: requestPathname } = request.nextUrl;

  // Public routes do not need Supabase session refresh/checking.
  // Avoid making an Auth request on login/signup/password-recovery pages.
  const publicAuthRoutes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ];

  if (publicAuthRoutes.some((route) => requestPathname === route)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && pathname.startsWith("/app")) {
    const redirectUrl = new URL("/login", request.url);
    // Preserve the full path + query string so, after logging in, the user lands
    // back exactly where they were trying to go (e.g. /app/calendars/abc123?tab=x).
    redirectUrl.searchParams.set("redirectTo", pathname + search);
    return NextResponse.redirect(redirectUrl);
  }

  if (user) {
    // A password sign-in alone only ever grants aal1 — an account with a
    // verified TOTP factor (nextLevel === 'aal2') must also complete
    // /login/mfa before its session counts as fully authenticated. This is
    // enforced here (not just in loginAction's redirect) so that an
    // existing aal1-only session can never reach /app by any other route,
    // e.g. a bookmark or a tab left open from before 2FA was turned on.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa = !!aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";

    if (needsMfa && pathname.startsWith("/app")) {
      const redirectUrl = new URL("/login/mfa", request.url);
      redirectUrl.searchParams.set("redirectTo", pathname + search);
      return NextResponse.redirect(redirectUrl);
    }

    if (!needsMfa && (pathname === "/login" || pathname === "/signup" || pathname === "/login/mfa")) {
      return NextResponse.redirect(new URL("/app/dashboard", request.url));
    }
  }

  return response;
}
