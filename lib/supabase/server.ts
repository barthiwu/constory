import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes the session via the request's cookies and uses the
 * publishable (anon) key, so it is still subject to RLS — this is the client
 * to use for anything that should be scoped to the signed-in user.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component that can't set cookies (e.g. during
            // a prefetch). The proxy is responsible for refreshing the session
            // cookie on the next navigation, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Admin client using the Supabase secret (service-role) key. This BYPASSES
 * Row Level Security entirely, so it must only be used in trusted
 * server-side code (Server Actions / Route Handlers) after the caller's
 * workspace membership has already been checked with the regular
 * `createClient()` above — never expose this client or its key to the
 * browser.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey || secretKey.startsWith("REPLACE_WITH")) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not configured. Set it in your environment before using createAdminClient().",
    );
  }

  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // no-op: the admin client never reads or writes session cookies
      },
    },
  });
}
