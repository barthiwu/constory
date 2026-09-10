import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInvitePreview } from "@/services/workspace-service";
import { logoutAction } from "@/app/(auth)/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "You're invited — Constory" };

const ROLE_LABEL: Record<string, string> = { admin: "an admin", editor: "an editor", viewer: "a viewer" };

/**
 * Public preview for a team invite — deliberately outside the /app route
 * group (lib/supabase/proxy.ts only guards /app) so it works for a visitor
 * who has no Constory account yet at all. Reads the invite via
 * get_invite_preview (migration 0021, granted to `anon` too) rather than a
 * table select, which would fail RLS for anyone but a workspace admin.
 *
 * The actual accept happens on app/app/invite/[token]/accept/page.tsx — a
 * normal /app page, so it's already gated by the proxy's login requirement.
 * When the visitor is already logged in with the matching email, this page
 * redirects straight there instead of showing anything.
 */
export default async function InvitePreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const [preview, { data: { user } }] = await Promise.all([
    getInvitePreview(supabase, token),
    supabase.auth.getUser(),
  ]);

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite not found</CardTitle>
          <CardDescription>This invite link isn&apos;t valid. Ask whoever invited you to send a new one.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (preview.status === "revoked") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite revoked</CardTitle>
          <CardDescription>This invite to {preview.workspaceName} is no longer valid. Ask an admin to send a new one.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (preview.status === "accepted") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Already accepted</CardTitle>
          <CardDescription>This invite to {preview.workspaceName} has already been accepted.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/app">Go to Constory</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (preview.expired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite expired</CardTitle>
          <CardDescription>This invite to {preview.workspaceName} has expired. Ask an admin to send a new one.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const roleLabel = ROLE_LABEL[preview.role] ?? preview.role;

  if (user) {
    if (user.email?.toLowerCase() === preview.invitedEmail.toLowerCase()) {
      redirect(`/app/invite/${token}/accept`);
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Wrong account</CardTitle>
          <CardDescription>
            This invite to {preview.workspaceName} was sent to {preview.invitedEmail}, but you&apos;re logged in as {user.email}.
            Log out and sign in with the invited address to accept it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" className="w-full">
              Log out
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;re invited</CardTitle>
        <CardDescription>
          {preview.inviterName ? `${preview.inviterName} invited` : "You've been invited"} you to join{" "}
          <span className="font-medium text-text-primary">{preview.workspaceName}</span> on Constory as {roleLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button asChild className="w-full">
          <Link href={`/signup?redirectTo=${encodeURIComponent(`/app/invite/${token}/accept`)}&email=${encodeURIComponent(preview.invitedEmail)}`}>
            Create an account
          </Link>
        </Button>
        <Button asChild variant="secondary" className="w-full">
          <Link href={`/login?redirectTo=${encodeURIComponent(`/app/invite/${token}/accept`)}`}>Log in</Link>
        </Button>
        <p className="text-center text-xs text-text-muted">Sent to {preview.invitedEmail}</p>
      </CardContent>
    </Card>
  );
}
