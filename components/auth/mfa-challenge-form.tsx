"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";
import { verifyMfaChallengeAction } from "@/app/(auth)/actions";

export function MfaChallengeForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await verifyMfaChallengeAction(code, redirectTo);
    setSubmitting(false);
    if (result?.error) setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor verification</CardTitle>
        <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <FormField label="Verification code" htmlFor="mfa-code" error={error ?? undefined} required>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              invalid={!!error}
            />
          </FormField>

          <Button type="submit" className="w-full" loading={submitting} disabled={code.length !== 6}>
            Verify
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
