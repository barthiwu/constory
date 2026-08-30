import { describe, it, expect, vi, beforeEach } from "vitest";

// `switchWorkspace` writes the active-workspace cookie via next/headers'
// cookies(), which only works inside a real Next.js request context. Stub it
// with an in-memory store so we can assert, from outside that context,
// whether the cookie was actually written or correctly left untouched.
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
  }),
}));

const { getWorkspaceMembership, switchWorkspace } = await import("@/services/workspace-service");

/** Minimal fake Supabase client covering only the chain `getWorkspaceMembership` uses. */
function fakeSupabase(membershipRow: { role: string } | null, queryError: Error | null = null) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
  return {
    client: {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          maybeSingle: async () => {
            calls.push({ table, filters });
            return { data: membershipRow, error: queryError };
          },
        };
        return builder;
      },
      // Cast through unknown in the test only — this stub deliberately implements
      // just the subset of the real SupabaseClient surface these functions use.
    } as unknown as Parameters<typeof getWorkspaceMembership>[0],
    calls,
  };
}

describe("getWorkspaceMembership", () => {
  it("returns the role when the user is a member", async () => {
    const { client } = fakeSupabase({ role: "editor" });
    const role = await getWorkspaceMembership(client, "user-1", "ws-1");
    expect(role).toBe("editor");
  });

  it("returns null when the user is not a member", async () => {
    const { client } = fakeSupabase(null);
    const role = await getWorkspaceMembership(client, "user-1", "ws-1");
    expect(role).toBeNull();
  });

  it("throws on a query error rather than silently treating it as 'not a member'", async () => {
    const { client } = fakeSupabase(null, new Error("connection reset"));
    await expect(getWorkspaceMembership(client, "user-1", "ws-1")).rejects.toThrow("connection reset");
  });
});

describe("switchWorkspace (defense in depth)", () => {
  beforeEach(() => {
    cookieStore.clear();
  });

  it("rejects the switch and never writes the cookie when the user is not a member", async () => {
    const { client } = fakeSupabase(null);
    const result = await switchWorkspace(client, "user-1", "workspace-not-mine");

    expect(result.ok).toBe(false);
    expect(cookieStore.has("constory_workspace_id")).toBe(false);
  });

  it("allows the switch and writes the cookie when the user is an actual member", async () => {
    const { client } = fakeSupabase({ role: "owner" });
    const result = await switchWorkspace(client, "user-1", "workspace-mine");

    expect(result.ok).toBe(true);
    expect(cookieStore.get("constory_workspace_id")).toBe("workspace-mine");
  });
});
