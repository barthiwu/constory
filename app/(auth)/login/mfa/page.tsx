import type { Metadata } from "next";
import { Suspense } from "react";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";

export const metadata: Metadata = { title: "Two-factor verification — Constory" };

export default function LoginMfaPage() {
  return (
    <Suspense fallback={null}>
      <MfaChallengeForm />
    </Suspense>
  );
}
