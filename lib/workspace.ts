import { cookies } from "next/headers";

export const WORKSPACE_COOKIE = "constory_workspace_id";

export async function getActiveWorkspaceIdCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(WORKSPACE_COOKIE)?.value ?? null;
}

export async function setActiveWorkspaceIdCookie(workspaceId: string) {
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
