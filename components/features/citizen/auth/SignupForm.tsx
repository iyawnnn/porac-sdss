"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_GROUP, AUTH_INPUT, AuthLink, AuthNote } from "@/components/features/auth/auth-ui";
import { AuthAlert, AuthButton, GoogleButton, PasswordInput } from "@/components/features/auth/AuthFields";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { oauthErrorMessage } from "./oauthErrors";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = oauthErrorMessage(searchParams.get("error"));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/citizens/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
        }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await res.json();
        setError(apiErrorMessage(data, "Sign up failed"));
        setSubmitting(false);
      }
    } catch {
      // Same network-failure gap as AdminLoginForm/LoginForm — fetch()
      // rejecting (rather than resolving non-2xx) used to leave the button
      // stuck on "Signing up…" forever with no error shown.
      setError("Could not reach the server. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create Account" description="Create an account to report concerns and follow their progress.">
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup className={AUTH_GROUP}>
          {oauthError && <AuthAlert tone="error">{oauthError}</AuthAlert>}

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                placeholder="Juan"
                autoComplete="given-name"
                required
                className={AUTH_INPUT}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                placeholder="Dela Cruz"
                autoComplete="family-name"
                required
                className={AUTH_INPUT}
              />
            </Field>
          </div>

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
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              name="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
              aria-describedby="password-hint"
            />
            <FieldDescription id="password-hint">Use at least 8 characters.</FieldDescription>
          </Field>

          {error && <AuthAlert tone="error">{error}</AuthAlert>}

          <AuthButton type="submit" loading={submitting}>
            {submitting ? "Creating account…" : "Create Account"}
          </AuthButton>

          <FieldSeparator className="*:data-[slot=field-separator-content]:bg-background">Or continue with</FieldSeparator>

          <GoogleButton />

          <AuthNote>
            Already have an account? <AuthLink href="/login">Sign In</AuthLink>
          </AuthNote>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
