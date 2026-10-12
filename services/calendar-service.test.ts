import { describe, it, expect } from "vitest";
import { createPost, updatePost, createCalendar, bulkCreatePosts } from "@/services/calendar-service";

/** Minimal chainable stand-in for the Supabase query builder that records what was written. */
function fakeSupabase() {
  const calls: { table: string; op: "insert" | "update"; payload: unknown }[] = [];
  const chain = (table: string) => {
    const builder: Record<string, unknown> = {
      insert(payload: unknown) {
        calls.push({ table, op: "insert", payload });
        return builder;
      },
      update(payload: unknown) {
        calls.push({ table, op: "update", payload });
        return builder;
      },
      eq: () => builder,
      select: () => builder,
      single: async () => ({ data: { id: "row" }, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [{ id: "row" }], error: null }),
    };
    return builder;
  };
  return { client: { from: (table: string) => chain(table) } as never, calls };
}

const baseInput = { scheduled_date: "2026-10-12", platform: "linkedin", title: "Hello" };

describe("calendar-service ignores structural columns smuggled in by a forged request", () => {
  it("createPost: the intended calendar id wins over a smuggled calendar_id", async () => {
    const { client, calls } = fakeSupabase();
    await createPost(client, "calendar-A", { ...baseInput, calendar_id: "calendar-B", id: "x", created_at: "1999" } as never);
    const payload = calls[0].payload as Record<string, unknown>;
    expect(payload.calendar_id).toBe("calendar-A");
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload.title).toBe("Hello");
  });

  it("bulkCreatePosts: same rule for every row", async () => {
    const { client, calls } = fakeSupabase();
    await bulkCreatePosts(client, "calendar-A", [{ ...baseInput, calendar_id: "calendar-B" } as never, { ...baseInput } as never]);
    const rows = calls[0].payload as Record<string, unknown>[];
    expect(rows.map((r) => r.calendar_id)).toEqual(["calendar-A", "calendar-A"]);
  });

  it("createCalendar: the intended workspace id wins over a smuggled workspace_id", async () => {
    const { client, calls } = fakeSupabase();
    await createCalendar(client, "ws-A", {
      name: "n",
      start_date: "2026-10-12",
      end_date: "2026-11-12",
      posting_frequency: 3,
      selected_platforms: [],
      workspace_id: "ws-B",
    } as never);
    expect((calls[0].payload as Record<string, unknown>).workspace_id).toBe("ws-A");
  });

  it("updatePost: structural columns can't be re-pointed", async () => {
    const { client, calls } = fakeSupabase();
    await updatePost(client, "post-1", { title: "New", calendar_id: "calendar-B", id: "other" } as never);
    expect(calls[0].payload).toEqual({ title: "New" });
  });
});
