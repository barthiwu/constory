"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/layout/form-field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  enrollMfaFactorAction,
  verifyMfaEnrollmentAction,
  unenrollMfaFactorAction,
  type MfaFactor,
} from "@/app/app/(shell)/settings/security/actions";

export function SecurityView({ factors: initialFactors }: { factors: MfaFactor[] }) {
  const { toast } = useToast();
  const [factors, setFactors] = useState(initialFactors);
  const [isPending, startTransition] = useTransition();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<MfaFactor | null>(null);

  const verifiedFactor = factors.find((f) => f.status === "verified") ?? null;

  async function openEnroll() {
    setEnrollOpen(true);
    setEnrolling(true);
    setVerifyError(null);
    setCode("");
    const result = await enrollMfaFactorAction();
    setEnrolling(false);
    if (result.error || !result.factorId) {
      toast({ title: "Couldn't start setup", description: result.error, variant: "error" });
      setEnrollOpen(false);
      return;
    }
    setFactorId(result.factorId);
    setQrCode(result.qrCode ?? null);
    setSecret(result.secret ?? null);
  }

  function handleVerify() {
    if (!factorId) return;
    setVerifyError(null);
    startTransition(async () => {
      const result = await verifyMfaEnrollmentAction(factorId, code);
      if (result.error) {
        setVerifyError(result.error);
        return;
      }
      setEnrollOpen(false);
      setFactors((prev) => [...prev.filter((f) => f.id !== factorId), { id: factorId, friendlyName: "Authenticator app", status: "verified", createdAt: new Date().toISOString() }]);
      toast({ title: "Two-factor authentication enabled", variant: "success" });
    });
  }

  function handleRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    startTransition(async () => {
      const result = await unenrollMfaFactorAction(target.id);
      setRemoveTarget(null);
      if (result.error) {
        toast({ title: "Couldn't remove", description: result.error, variant: "error" });
        return;
      }
      setFactors((prev) => prev.filter((f) => f.id !== target.id));
      toast({ title: "Two-factor authentication removed", variant: "success" });
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>Require a code from an authenticator app (like Google Authenticator or 1Password) in addition to your password when signing in.</CardDescription>
        </CardHeader>
        <CardContent>
          {verifiedFactor ? (
            <div className="flex items-center gap-3">
              <Badge variant="success">Enabled</Badge>
              <span className="text-sm text-text-secondary">{verifiedFactor.friendlyName ?? "Authenticator app"}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="default">Not enabled</Badge>
              <span className="text-sm text-text-secondary">Your account only requires a password to sign in.</span>
            </div>
          )}
        </CardContent>
        <CardFooter>
          {verifiedFactor ? (
            <Button variant="secondary" onClick={() => setRemoveTarget(verifiedFactor)}>
              Turn off two-factor authentication
            </Button>
          ) : (
            <Button onClick={openEnroll}>Set up two-factor authentication</Button>
          )}
        </CardFooter>
      </Card>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</DialogDescription>
          </DialogHeader>

          {enrolling ? (
            <p className="py-8 text-center text-sm text-text-secondary">Preparing setup…</p>
          ) : (
            <div className="grid gap-4">
              {qrCode && (
                <div className="flex justify-center rounded-md border border-border bg-white p-4" dangerouslySetInnerHTML={{ __html: qrCode }} />
              )}
              {secret && (
                <p className="break-all text-center text-xs text-text-muted">
                  Can&apos;t scan? Enter this key manually: <span className="font-mono text-text-secondary">{secret}</span>
                </p>
              )}
              <FormField label="6-digit code" htmlFor="mfa-code" error={verifyError ?? undefined}>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  invalid={!!verifyError}
                />
              </FormField>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setEnrollOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleVerify} loading={isPending} disabled={enrolling || code.length !== 6}>
              Verify and enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will only require a password to sign in. You can set it back up again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={isPending}>
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
