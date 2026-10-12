// Content-Security-Policy builder (nonce-based, "strict-dynamic").
//
// Rolled out in REPORT-ONLY mode first: the browser evaluates the policy and posts violations to
// /api/csp-report but blocks nothing, so a directive we got wrong costs us a log line, not a broken page.
// When the report log has been quiet across a normal click-through of the app, flip CSP_ENFORCE (see
// proxy.ts) to start enforcing.
//
// What the app actually loads (audited in the code): scripts only from itself (Next.js bundles + inline
// bootstrap scripts, which get the nonce automatically); fonts self-hosted (next/font/local); images from
// itself, data:/blob: URIs and Supabase Storage; network calls from the browser only to itself and to the
// Supabase project (REST + realtime websocket). Paystack and OpenAI are only ever called from the server /
// reached by full-page navigation, which CSP's connect-src does not govern.

export const CSP_ENFORCE_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
export const CSP_REPORT_PATH = "/api/csp-report";

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export interface CspOptions {
  nonce: string;
  isDev?: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL, e.g. https://abcd.supabase.co */
  supabaseUrl?: string | null;
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, isDev = false, supabaseUrl }: CspOptions): string {
  const supabaseOrigin = originOf(supabaseUrl);
  const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^http/, "ws") : null;

  const connect = ["'self'", supabaseOrigin, supabaseWs, ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : [])].filter(Boolean);
  const img = ["'self'", "data:", "blob:", "https://*.supabase.co"];

  const directives: string[] = [
    "default-src 'self'",
    // 'unsafe-eval' only in dev: React uses eval for debugging info there. Never in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style="" attributes (React `style` props, Radix, charts) can't carry a nonce; style injection is
    // far lower risk than script injection, so styles stay 'unsafe-inline' rather than flooding the report log.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ];
  return directives.join("; ");
}
