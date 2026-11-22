"use client";

import { useAuthSubmit } from "@/components/features/auth/useAuthSubmit";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_GROUP, AUTH_INPUT } from "@/components/features/auth/auth-ui";
import { AuthAlert, AuthButton, PasswordInput } from "@/components/features/auth/AuthFields";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

export default function AdminLoginForm() {
  const { error, submitting, clearError, submit } = useAuthSubmit();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    return submit(e, async (form) => {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });

      if (res.ok) {
        // A full load renders the staff layout once with the new session.
        window.location.assign("/admin");
        return;
      }
      return apiErrorMessage(await res.json().catch(() => null), "Login failed");
    });
  }

  return (
    <AuthShell title="Staff Sign In" description="Access the PORAC-SDSS municipal operations portal.">
      <form onSubmit={handleSubmit} onChange={clearError} noValidate>
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
