"use client";

import { useState } from "react";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_GROUP, AUTH_INPUT } from "@/components/features/auth/auth-ui";
import { AuthAlert, AuthButton, PasswordInput } from "@/components/features/auth/AuthFields";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

export default function AdminLoginForm() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });

      if (res.ok) {
        // One full load: /admin/login shares the /admin layout, so a client
        // push kept the signed-out layout and push + refresh rendered the
        // dashboard twice.
        window.location.assign("/admin");
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
    <AuthShell title="Staff Sign In" description="Access the PORAC-SDSS municipal operations portal.">
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup className={AUTH_GROUP}>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="officer@porac.gov.ph"
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
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </Field>

          {error && <AuthAlert tone="error">{error}</AuthAlert>}

          <AuthButton type="submit" loading={submitting}>
            {submitting ? "Signing in…" : "Sign In"}
          </AuthButton>

          <FieldDescription className="text-center">
            Account access restricted. Contact LGU IT Administrator for access requests.
          </FieldDescription>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
