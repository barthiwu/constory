"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { forgotPasswordAction } from "@/app/(auth)/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordInput) {
    setMessage(null);
    const result = await forgotPasswordAction(values);
    setMessage(result.message ?? null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a link to set a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <div className="grid gap-4">
            <p className="rounded-md bg-success-light px-3 py-2 text-sm text-success">{message}</p>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/login">Back to login</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
            <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
              <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register("email")} />
            </FormField>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Send reset link
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-text-secondary">
          <Link href="/login" className="font-medium text-constory-blue hover:underline">
            Back to login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
