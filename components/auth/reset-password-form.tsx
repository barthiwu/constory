"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";
import { resetPasswordAction } from "@/app/(auth)/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";

export function ResetPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null);
    const result = await resetPasswordAction(values);
    if (result?.error) {
      setServerError(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <FormField
            label="New password"
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
          <FormField label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
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
            Reset password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
