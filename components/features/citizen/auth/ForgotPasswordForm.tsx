"use client";

import { useState } from "react";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_GROUP, AUTH_INPUT, AuthLink, AuthNote } from "@/components/features/auth/auth-ui";
import { AuthAlert, AuthButton } from "@/components/features/auth/AuthFields";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/citizens/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email") }),
    });

    // The backend always returns 200 regardless of whether the email
    // exists — the only other outcome is a rate-limit rejection, which is
    // safe to surface distinctly (it doesn't reveal anything about a
    // specific email).
    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Something went wrong. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and, if you have a password-based account, we'll send you a link to reset it."
    >
      {submitted ? (
        <div className="flex flex-col gap-(--auth-gap)">
          <AuthAlert tone="success">
            If an account exists for that email, we&apos;ve sent a link to reset your password.
          </AuthAlert>
          <AuthNote>
            <AuthLink href="/login">Back to Sign In</AuthLink>
          </AuthNote>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup className={AUTH_GROUP}>
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

            {error && <AuthAlert tone="error">{error}</AuthAlert>}

            <AuthButton type="submit" loading={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </AuthButton>

            <AuthNote>
              <AuthLink href="/login">Back to Sign In</AuthLink>
            </AuthNote>
          </FieldGroup>
        </form>
      )}
    </AuthShell>
  );
}
