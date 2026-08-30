"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { loginAction } from "@/app/(auth)/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/layout/form-field";

export function LoginForm() {
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "success";
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const result = await loginAction(values);
    if (result?.error) {
      setServerError(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Log in to your Constory workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        {justReset && (
          <p className="mb-4 rounded-md bg-success-light px-3 py-2 text-sm text-success">
            Your password has been reset. Log in with your new password.
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
            <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register("email")} />
          </FormField>
          <FormField label="Password" htmlFor="password" error={errors.password?.message} required>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              invalid={!!errors.password}
              {...register("password")}
            />
          </FormField>

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm font-medium text-constory-blue hover:underline">
              Forgot password?
            </Link>
          </div>

          {serverError && (
            <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Log in
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-constory-blue hover:underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
