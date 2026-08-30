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

export async function signupAction(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { fullName, email, password } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
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

  redirect("/app/onboarding");
}

export async function loginAction(input: LoginInput, redirectTo?: string | null): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  // Never trust the client-supplied redirect target directly — validate it against
  // an allowlist of safe, in-app paths before using it (prevents open redirects).
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
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
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
