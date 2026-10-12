import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { buildCsp, generateNonce, CSP_ENFORCE_HEADER, CSP_REPORT_ONLY_HEADER } from "@/lib/security/csp";

/**
 * Set to true to ENFORCE the Content-Security-Policy instead of only reporting violations. Leave false until the
 * "[csp-report]" log lines have gone quiet across a normal click-through of the app (see lib/security/csp.ts).
 */
const CSP_ENFORCE = false;

export async function proxy(request: NextRequest) {
  // API routes return JSON, not documents, so a document CSP (and its per-request nonce) is meaningless there.
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  let csp: string | null = null;
  let headerName = CSP_REPORT_ONLY_HEADER;
  if (!isApi) {
    if (CSP_ENFORCE) headerName = CSP_ENFORCE_HEADER;
    const nonce = generateNonce();
    csp = buildCsp({ nonce, isDev: process.env.NODE_ENV === "development", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
    // Next.js reads the nonce from the REQUEST's CSP header while rendering and stamps it onto its own scripts;
    // x-nonce lets our own layout hand it to third-party components (next-themes).
    request.headers.set(headerName, csp);
    request.headers.set("x-nonce", nonce);
  }

  const response = await updateSession(request);
  if (csp) response.headers.set(headerName, csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static files, image optimization)
     * - favicon.ico, and common static asset extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
