// Runs automatically after every `npm run build` (see package.json's
// "postbuild" script) as a nudge for optional-but-wanted setup that's easy
// to forget because nothing actually breaks without it — the app degrades
// gracefully (see lib/notifications/email.ts, app/api/cron/*), so there's
// no error to force the issue. This just prints a friendly reminder to the
// terminal; it never fails the build.
//
// Reads real env vars first (what a Vercel/CI build actually has), then
// falls back to parsing .env.local by hand for local `npm run build` runs
// — deliberately no `dotenv` dependency, just a couple of KEY=VALUE lines.

import { readFileSync, existsSync } from "node:fs";

function loadDotEnvLocal() {
  const path = new URL("../.env.local", import.meta.url);
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

const dotEnvLocal = loadDotEnvLocal();
function get(key) {
  return process.env[key] || dotEnvLocal[key] || "";
}

const reminders = [];

if (!get("RESEND_API_KEY") || !get("RESEND_FROM_EMAIL")) {
  reminders.push(
    "Resend isn't set up yet — low-credit / scheduled-post / weekly-digest notification EMAILS are being skipped " +
      "(the in-app bell still works). Set RESEND_API_KEY + RESEND_FROM_EMAIL to turn them on. " +
      "See .env.example, or ask Claude \"how do I set the Resend API key\".",
  );
}

if (!get("CRON_SECRET")) {
  reminders.push(
    "CRON_SECRET isn't set — the two notification cron routes (app/api/cron/post-reminders, " +
      "app/api/cron/weekly-digest) will reject every request, including Vercel's own scheduled ones. " +
      "Set CRON_SECRET in your deploy target's env vars once you're ready for those to actually run.",
  );
}

if (reminders.length > 0) {
  console.log("\n\x1b[33m%s\x1b[0m", "⚠  Build reminders (non-blocking):");
  for (const r of reminders) console.log(`   - ${r}`);
  console.log("");
}
