"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
import { signupAction } from "@/app/(auth)/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    const result = await signupAction(values);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    if (result?.success) {
      setSuccessMessage(result.message ?? "Account created.");
    }
  }

  if (successMessage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>{successMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/login">Back to login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Start planning content with purpose.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
            <Input id="fullName" autoComplete="name" invalid={!!errors.fullName} {...register("fullName")} />
          </FormField>
          <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
            <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register("email")} />
          </FormField>
          <FormField
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            hint={!errors.password ? "At least 8 characters, with a letter and a number." : undefined}
            required
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              invalid={!!errors.password}
              {...register("password")}
            />
          </FormField>
          <FormField label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
          </FormField>

          {serverError && (
            <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Create account
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-constory-blue hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
