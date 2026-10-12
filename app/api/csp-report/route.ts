import { NextResponse } from "next/server";
import { withinRateLimitFor } from "@/lib/rate-limit";
import { clientIpFrom, hashKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10_000;

/**
 * Receives Content-Security-Policy violation reports (policy runs in report-only mode, see lib/security/csp.ts).
 * Public by necessity -- browsers post here without cookies -- so it does as little as possible: size-capped,
 * rate-limited per IP, writes one compact log line, stores nothing, always answers 204. Read the reports in the
 * deployment's logs by searching for "[csp-report]".
 */
export async function POST(request: Request) {
  const ipKey = hashKey(clientIpFrom(request.headers));
  if (!(await withinRateLimitFor(`csp:ip:${ipKey}`, 60, 60))) return new NextResponse(null, { status: 204 });

  let text = "";
  try {
    text = (await request.text()).slice(0, MAX_BODY_BYTES);
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    // Legacy report-uri: { "csp-report": {...} }.  Reporting API: [{ type: "csp-violation", body: {...} }].
    const reports = Array.isArray(parsed) ? parsed.map((r) => (r as { body?: unknown }).body ?? r) : [(parsed as Record<string, unknown>)["csp-report"] ?? parsed];
    for (const r of reports.slice(0, 5)) {
      const v = (r ?? {}) as Record<string, unknown>;
      console.warn(
        "[csp-report]",
        JSON.stringify({
          directive: v["violated-directive"] ?? v["effectiveDirective"] ?? v["effective-directive"],
          blocked: v["blocked-uri"] ?? v["blockedURL"],
          page: v["document-uri"] ?? v["documentURL"],
          source: v["source-file"] ?? v["sourceFile"],
          line: v["line-number"] ?? v["lineNumber"],
          sample: typeof v["script-sample"] === "string" ? (v["script-sample"] as string).slice(0, 80) : undefined,
        }),
      );
    }
  } catch {
    // Not JSON -- ignore.
  }
  return new NextResponse(null, { status: 204 });
}
