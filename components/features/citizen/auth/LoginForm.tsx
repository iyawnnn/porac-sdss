"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_INPUT, AuthAlert, GoogleButton, PasswordInput } from "@/components/features/auth/AuthFields";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { oauthErrorMessage } from "./oauthErrors";
import { authNoticeMessage } from "./authNotices";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const oauthError = oauthErrorMessage(searchParams.get("error"));
  const notice = authNoticeMessage(searchParams.get("notice"));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/citizens/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });

      if (res.ok) {
        // One full load, so the dashboard renders once with the new session.
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(apiErrorMessage(data, "Login failed"));
        setSubmitting(false);
      }
    } catch {
      // fetch() rejects on a network-level failure (DNS, connection refused,
      // dropped connection) rather than resolving with a non-2xx response —
      // without this, a transient connection failure left the button stuck
      // on "Signing in…" forever with no way to retry.
      setError("Could not reach the server. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      portal="citizen"
      title="Citizen Sign In"
      description="Sign in to report local concerns and track their progress."
      footer={
        <>
          Municipal staff?{" "}
          <Link href="/admin/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Go to Staff Sign In
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {notice && <AuthAlert tone="success">{notice}</AuthAlert>}
        {oauthError && <AuthAlert tone="error">{oauthError}</AuthAlert>}

        <GoogleButton />

        <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">Or continue with email</FieldSeparator>

        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                required
                className={AUTH_INPUT}
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </Field>

            {error && <AuthAlert tone="error">{error}</AuthAlert>}

            <Button type="submit" size="lg" disabled={submitting} className="h-11 w-full text-base">
              {submitting ? "Signing in…" : "Sign In"}
            </Button>

            <FieldDescription className="text-center">
              Don&apos;t have an account? <Link href="/signup">Create Account</Link>
            </FieldDescription>
          </FieldGroup>
        </form>
      </div>
    </AuthShell>
  );
}
