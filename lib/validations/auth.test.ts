import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/auth";

describe("signupSchema", () => {
  const valid = { fullName: "Ada Lovelace", email: "ada@example.com", password: "correct1horse", confirmPassword: "correct1horse" };

  it("accepts valid signup input", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid email address", () => {
    const result = signupSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing full name", () => {
    const result = signupSchema.safeParse({ ...valid, fullName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({ ...valid, password: "ab1", confirmPassword: "ab1" });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no digit", () => {
    const result = signupSchema.safeParse({ ...valid, password: "abcdefgh", confirmPassword: "abcdefgh" });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no letter", () => {
    const result = signupSchema.safeParse({ ...valid, password: "12345678", confirmPassword: "12345678" });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched confirm-password", () => {
    const result = signupSchema.safeParse({ ...valid, confirmPassword: "somethingElse1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("confirmPassword");
    }
  });
});

describe("loginSchema", () => {
  it("accepts a valid email + non-empty password", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "anything" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "anything" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "user@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a strong matching password pair", () => {
    expect(resetPasswordSchema.safeParse({ password: "newpass123", confirmPassword: "newpass123" }).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    expect(resetPasswordSchema.safeParse({ password: "newpass123", confirmPassword: "different1" }).success).toBe(false);
  });

  it("rejects a weak new password", () => {
    expect(resetPasswordSchema.safeParse({ password: "short1", confirmPassword: "short1" }).success).toBe(false);
  });
});
