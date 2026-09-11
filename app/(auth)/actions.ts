"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSafeRedirectPath } from "@/lib/redirect";
import {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type LoginInput,
  type SignupInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/lib/validations/auth";

export interface ActionResult {
  error?: string;
  success?: boolean;
  message?: string;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match our records.";
  if (m.includes("email not confirmed")) return "Please confirm your email address before logging in.";
  if (m.includes("user already registered") || m.includes("already registered"))
    return "An account with that email already exists. Try logging in instead.";
  if (m.includes("password should be at least")) return "Your password is too short.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  return "Something went wrong. Please try again.";
}

export async function signupAction(input: SignupInput, redirectTo?: string | null): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { fullName, email, password } = parsed.data;

  // `redirectTo` is where a signup that started from a team-invite link
  // (see app/invite/[token]/page.tsx) needs to land afterward instead of
  // onboarding — always re-validated through getSafeRedirectPath, never
  // trusted as-is (same rule as loginAction below).
  const safeRedirect = getSafeRedirectPath(redirectTo, "/app/onboarding");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: redirectTo
        ? `${process.env.NEXT_PUBLIC_APP_URL}/login?redirectTo=${encodeURIComponent(safeRedirect)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/login`,
    },
  });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  if (!data.session) {
    // Email confirmation is required on this project before a session is issued.
    return {
      success: true,
      message: "Check your inbox to confirm your email address, then log in.",
    };
  }

  redirect(safeRedirect);
}

export async function loginAction(
  input: LoginInput,
  redirectTo?: string | null,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  // A password match alone isn't enough for an account with two-factor
  // authentication enabled — signInWithPassword grants an aal1 session
  // regardless, and only mfa.verify() (completed on /login/mfa) can raise it
  // to aal2. nextLevel === 'aal2' means the account HAS a verified TOTP
  // factor; currentLevel !== nextLevel means this particular session hasn't
  // cleared it yet.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    const safeRedirect = getSafeRedirectPath(redirectTo);
    redirect(`/login/mfa?redirectTo=${encodeURIComponent(safeRedirect)}`);
  }

  redirect(getSafeRedirectPath(redirectTo));
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(input: ForgotPasswordInput): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // Routes through app/auth/confirm/route.ts (a Route Handler) so the
    // code exchange can actually persist the session cookie -- see that
    // file's comment for why exchanging directly in a page Server
    // Component (the previous approach) silently failed to do so.
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });

  // Always report success to avoid leaking which emails have accounts.
  if (error) {
    return {
      success: true,
      message: "If an account exists for that email, a reset link is on its way.",
    };
  }

  return {
    success: true,
    message: "If an account exists for that email, a reset link is on its way.",
  };
}

export async function resetPasswordAction(input: ResetPasswordInput): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  redirect("/login?reset=success");
}

/**
 * Completes the second factor of a login that loginAction routed to
 * /login/mfa (see the AAL check there). The user already has a valid aal1
 * session at this point — this only raises it to aal2, it doesn't
 * authenticate them from scratch.
 */
export async function verifyMfaChallengeAction(code: string, redirectTo?: string | null): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  const factor = factorsError ? null : factors?.totp.find((f) => f.status === "verified");
  if (!factor) {
    return { error: "No two-factor authenticator found on this account. Please log in again." };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError || !challenge) {
    return { error: "Couldn't verify that code. Please try again." };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (verifyError) {
    return { error: "That code didn't match. Check your authenticator app and try again." };
  }

  redirect(getSafeRedirectPath(redirectTo));
}
