"use client";

import { useSearchParams } from "next/navigation";
import { useAuthSubmit } from "@/components/features/auth/useAuthSubmit";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_GROUP, AUTH_INPUT, AuthLink, AuthNote } from "@/components/features/auth/auth-ui";
import { AuthAlert, AuthButton, GoogleButton, PasswordInput } from "@/components/features/auth/AuthFields";
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { oauthErrorMessage } from "./oauthErrors";
import { authNoticeMessage } from "./authNotices";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const oauthError = oauthErrorMessage(searchParams.get("error"));
  const notice = authNoticeMessage(searchParams.get("notice"));
  const { error, submitting, clearError, submit } = useAuthSubmit();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    return submit(e, async (form) => {
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
        return;
      }
      return apiErrorMessage(await res.json().catch(() => null), "Login failed");
    });
  }

  return (
    <AuthShell title="Welcome back" description="Sign in to report local concerns and track their progress.">
      <form onSubmit={handleSubmit} onChange={clearError} noValidate>
        <FieldGroup className={AUTH_GROUP}>
          {notice && <AuthAlert tone="success">{notice}</AuthAlert>}
          {oauthError && <AuthAlert tone="error">{oauthError}</AuthAlert>}

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
              <AuthLink href="/forgot-password" className="text-sm">
                Forgot password?
              </AuthLink>
            </div>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </Field>

          {error && <AuthAlert tone="error">{error}</AuthAlert>}

          <AuthButton type="submit" loading={submitting}>
            {submitting ? "Signing in…" : "Sign In"}
          </AuthButton>

          <FieldSeparator className="*:data-[slot=field-separator-content]:bg-background">Or continue with</FieldSeparator>

          <GoogleButton />

          <AuthNote>
            Don&apos;t have an account? <AuthLink href="/signup">Create Account</AuthLink>
          </AuthNote>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
