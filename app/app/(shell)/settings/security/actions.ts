"use server";

import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

export interface MfaFactor {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
  createdAt: string;
}

/** The signed-in user's enrolled TOTP factors (usually zero or one — enrollFactorAction below refuses a second while one is already verified). */
export async function listMfaFactorsAction(): Promise<MfaFactor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  return data.totp.map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, status: f.status, createdAt: f.created_at }));
}

export interface EnrollMfaResult extends ActionResult {
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

/**
 * Starts TOTP enrollment: returns a QR code (SVG markup) and the raw secret
 * for manual entry. The factor exists in Supabase as soon as this returns
 * but stays `unverified` — and doesn't count toward login — until
 * verifyMfaEnrollmentAction below confirms the user's authenticator app
 * actually produces matching codes.
 */
export async function enrollMfaFactorAction(): Promise<EnrollMfaResult> {
  const supabase = await createClient();

  const existing = await listMfaFactorsAction();
  if (existing.some((f) => f.status === "verified")) {
    return { error: "You already have two-factor authentication enabled. Remove it first to set up a new authenticator." };
  }
  // Supabase won't let a second factor be enrolled while an unverified one
  // is sitting around from an abandoned attempt — clear it out first so
  // retrying (e.g. after closing the QR dialog) doesn't get stuck.
  for (const f of existing) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) return { error: error?.message ?? "Couldn't start two-factor setup. Please try again." };

  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms enrollment by verifying one code from the authenticator app — this is what actually turns the factor on. */
export async function verifyMfaEnrollmentAction(factorId: string, code: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) return { error: "Couldn't verify that code. Please try again." };

  const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
  if (verifyError) return { error: "That code didn't match. Check your authenticator app and try again." };

  return {};
}

export async function unenrollMfaFactorAction(factorId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: "Couldn't remove two-factor authentication. Please try again." };
  return {};
}
