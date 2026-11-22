"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthSubmit } from "@/components/features/auth/useAuthSubmit";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_GROUP, AUTH_INPUT, AuthLink, AuthNote } from "@/components/features/auth/auth-ui";
import { AuthAlert, AuthButton, GoogleButton, PasswordInput, PasswordRequirement } from "@/components/features/auth/AuthFields";
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { oauthErrorMessage } from "./oauthErrors";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = oauthErrorMessage(searchParams.get("error"));
  const [password, setPassword] = useState("");
  const { error, submitting, clearError, submit } = useAuthSubmit();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    return submit(e, async (form) => {
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
        return;
      }
      return apiErrorMessage(await res.json().catch(() => null), "Sign up failed");
    });
  }

  return (
    <AuthShell title="Create Account" description="Create an account to report concerns and follow their progress.">
      <form onSubmit={handleSubmit} onChange={clearError} noValidate>
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
              autoComplete="new-password"
              required
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="password-hint"
            />
            <PasswordRequirement id="password-hint" password={password} />
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
