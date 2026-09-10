"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { initials, formatDate } from "@/lib/utils";
import type { InviteRole, Role } from "@/types/database";
import {
  inviteMemberAction,
  revokeInviteAction,
  updateMemberRoleAction,
  removeMemberAction,
} from "@/app/app/(shell)/settings/team/actions";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const ROLE_BADGE_VARIANT: Record<Role, "blue" | "default" | "outline"> = {
  owner: "blue",
  admin: "blue",
  editor: "default",
  viewer: "outline",
};
const ASSIGNABLE_ROLES: InviteRole[] = ["admin", "editor", "viewer"];

export interface TeamMemberRow {
  id: string;
  userId: string;
  role: Role;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  isSelf: boolean;
  createdAt: string;
}

export interface TeamInviteRow {
  id: string;
  email: string;
  role: InviteRole;
  token: string;
  createdAt: string;
  expiresAt: string;
  invitedByName: string | null;
}

const inviteFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  role: z.enum(["admin", "editor", "viewer"]),
});
type InviteFormInput = z.infer<typeof inviteFormSchema>;

export function TeamView({
  members,
  invites,
  canManage,
}: {
  members: TeamMemberRow[];
  invites: TeamInviteRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormInput>({ resolver: zodResolver(inviteFormSchema), defaultValues: { role: "editor" } });

  async function onInvite(values: InviteFormInput) {
    const result = await inviteMemberAction(values.email, values.role);
    if (result.error) {
      toast({ title: "Couldn't send invite", description: result.error, variant: "error" });
      return;
    }
    if (result.emailSent) {
      toast({ title: "Invite sent", description: `${values.email} will get an email to join.`, variant: "success" });
      reset({ email: "", role: "editor" });
      setInviteOpen(false);
    } else if (result.inviteLink) {
      // Existing account — nothing was auto-emailed, so hand the inviter a
      // link to copy instead of closing the dialog out from under them.
      setInviteLink(result.inviteLink);
    }
    router.refresh();
  }

  async function handleRoleChange(memberUserId: string, role: InviteRole) {
    setUpdatingRoleFor(memberUserId);
    const result = await updateMemberRoleAction(memberUserId, role);
    setUpdatingRoleFor(null);
    if (result.error) {
      toast({ title: "Couldn't update role", description: result.error, variant: "error" });
      return;
    }
    router.refresh();
  }

  async function handleRevoke(inviteId: string) {
    setRevokingId(inviteId);
    const result = await revokeInviteAction(inviteId);
    setRevokingId(null);
    if (result.error) {
      toast({ title: "Couldn't revoke invite", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Invite revoked", variant: "success" });
    router.refresh();
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const result = await removeMemberAction(removeTarget.userId);
    setRemoving(false);
    if (result.error) {
      toast({ title: "Couldn't remove member", description: result.error, variant: "error" });
      setRemoveTarget(null);
      return;
    }
    toast({ title: removeTarget.isSelf ? "You left the workspace" : "Member removed", variant: "success" });
    setRemoveTarget(null);
    if (result.redirectTo) {
      router.push(result.redirectTo);
    }
    router.refresh();
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast({ title: "Link copied", variant: "success" });
    } catch {
      toast({ title: "Couldn't copy — copy it manually", variant: "error" });
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Team</CardTitle>
            <CardDescription>Everyone with access to this workspace.</CardDescription>
          </div>
          {canManage && (
            <Button
              onClick={() => {
                setInviteLink(null);
                reset({ email: "", role: "editor" });
                setInviteOpen(true);
              }}
            >
              Invite member
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-1">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-secondary">
              <Avatar className="h-9 w-9">
                {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
                <AvatarFallback>{initials(member.fullName ?? member.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {member.fullName || member.email || "Unknown"}
                  {member.isSelf && <span className="ml-1.5 text-xs font-normal text-text-muted">(you)</span>}
                </p>
                <p className="truncate text-xs text-text-muted">{member.email}</p>
              </div>

              {canManage && member.role !== "owner" && !member.isSelf ? (
                <Select
                  value={member.role}
                  onValueChange={(v) => handleRoleChange(member.userId, v as InviteRole)}
                  disabled={updatingRoleFor === member.userId}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={ROLE_BADGE_VARIANT[member.role]}>{ROLE_LABEL[member.role]}</Badge>
              )}

              {member.role !== "owner" && (canManage || member.isSelf) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Member actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRemoveTarget(member)} className="text-danger focus:text-danger">
                      {member.isSelf ? "Leave workspace" : "Remove from workspace"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
            <CardDescription>Invited but haven&apos;t joined yet.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-secondary">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{invite.email}</p>
                  <p className="truncate text-xs text-text-muted">
                    Invited {formatDate(invite.createdAt)}
                    {invite.invitedByName ? ` by ${invite.invitedByName}` : ""} &middot; expires {formatDate(invite.expiresAt)}
                  </p>
                </div>
                <Badge variant={ROLE_BADGE_VARIANT[invite.role]}>{ROLE_LABEL[invite.role]}</Badge>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={revokingId === invite.id}
                    onClick={() => handleRevoke(invite.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          {inviteLink ? (
            <>
              <DialogHeader>
                <DialogTitle>Share this invite link</DialogTitle>
                <DialogDescription>
                  That address already has a Constory account, so nothing was emailed automatically — copy this link and send it
                  yourself.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" onClick={copyInviteLink}>
                  Copy
                </Button>
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setInviteOpen(false);
                    setInviteLink(null);
                    reset({ email: "", role: "editor" });
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Invite a team member</DialogTitle>
                <DialogDescription>They&apos;ll be able to access this workspace once they accept.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onInvite)} noValidate className="grid gap-4">
                <FormField label="Email" htmlFor="invite-email" error={errors.email?.message} required>
                  <Input id="invite-email" type="email" invalid={!!errors.email} {...register("email")} />
                </FormField>
                <FormField label="Role" htmlFor="invite-role" required>
                  <Controller
                    name="role"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="invite-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <DialogFooter>
                  <Button type="submit" loading={isSubmitting}>
                    Send invite
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removeTarget?.isSelf ? "Leave this workspace?" : `Remove ${removeTarget?.fullName || removeTarget?.email}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.isSelf
                ? "You'll lose access to this workspace immediately. You can only rejoin if someone invites you again."
                : "They'll lose access to this workspace immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleRemove} loading={removing}>
              {removeTarget?.isSelf ? "Leave workspace" : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Not used elsewhere, but kept aligned with services/workspace-service.ts's
// InviteRole export in case a future caller wants it from here too.
export type { InviteRole as TeamInviteRole };
