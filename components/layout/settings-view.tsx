"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";
import { useToast } from "@/components/ui/toast";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { updateProfileAction, updateWorkspaceSettingsAction, changePasswordAction } from "@/app/app/(shell)/settings/actions";
import { logoutAction } from "@/app/(auth)/actions";

export function SettingsView({
  fullName,
  email,
  workspaceId,
  workspaceName,
  workspaceDescription,
}: {
  fullName: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  workspaceDescription: string;
}) {
  const { toast } = useToast();

  const [name, setName] = useState(fullName);
  const [profileDirty, setProfileDirty] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [wsName, setWsName] = useState(workspaceName);
  const [wsDescription, setWsDescription] = useState(workspaceDescription);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useUnsavedChangesWarning(profileDirty || workspaceDirty);

  async function handleSaveProfile() {
    setSavingProfile(true);
    const result = await updateProfileAction(name);
    setSavingProfile(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
    } else {
      setProfileDirty(false);
      toast({ title: "Profile updated", variant: "success" });
    }
  }

  async function handleSaveWorkspace() {
    setSavingWorkspace(true);
    const result = await updateWorkspaceSettingsAction(workspaceId, { name: wsName, description: wsDescription });
    setSavingWorkspace(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
    } else {
      setWorkspaceDirty(false);
      toast({ title: "Workspace updated", variant: "success" });
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setSavingPassword(true);
    const result = await changePasswordAction(password, confirmPassword);
    setSavingPassword(false);
    if (result.error) {
      setPasswordError(result.error);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    toast({ title: "Password updated", variant: "success" });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal account details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-md">
          <FormField label="Name" htmlFor="settings-name">
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setProfileDirty(true);
              }}
            />
          </FormField>
          <FormField label="Email" htmlFor="settings-email" hint="Contact support to change your email.">
            <Input id="settings-email" value={email} disabled />
          </FormField>
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveProfile} loading={savingProfile} disabled={!profileDirty} className="justify-self-start">
              Save changes
            </Button>
            {profileDirty && !savingProfile && <span className="text-xs text-text-muted">Unsaved changes</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Basic information about this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-md">
          <FormField label="Workspace name" htmlFor="settings-ws-name">
            <Input
              id="settings-ws-name"
              value={wsName}
              onChange={(e) => {
                setWsName(e.target.value);
                setWorkspaceDirty(true);
              }}
            />
          </FormField>
          <FormField label="Description" htmlFor="settings-ws-description" hint="Optional">
            <Textarea
              id="settings-ws-description"
              rows={3}
              value={wsDescription}
              onChange={(e) => {
                setWsDescription(e.target.value);
                setWorkspaceDirty(true);
              }}
            />
          </FormField>
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveWorkspace} loading={savingWorkspace} disabled={!workspaceDirty} className="justify-self-start">
              Save changes
            </Button>
            {workspaceDirty && !savingWorkspace && <span className="text-xs text-text-muted">Unsaved changes</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Password and session management.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-md">
          <FormField label="New password" htmlFor="settings-password" error={passwordError ?? undefined}>
            <Input id="settings-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <FormField label="Confirm new password" htmlFor="settings-confirm-password">
            <Input id="settings-confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </FormField>
          <Button onClick={handleChangePassword} loading={savingPassword} disabled={!password} className="justify-self-start">
            Update password
          </Button>
          <div className="border-t border-border pt-4">
            {/* Reversible, not destructive — see the matching note in
                components/layout/user-menu.tsx. */}
            <Button variant="secondary" onClick={() => void logoutAction()}>
              Log out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
