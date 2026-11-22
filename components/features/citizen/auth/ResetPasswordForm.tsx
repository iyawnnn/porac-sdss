"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_CTA_BUTTON, AUTH_GROUP, AuthCtaLabel, AuthLink, AuthNote } from "@/components/features/auth/auth-ui";
import { AuthAlert, AuthButton, PasswordInput } from "@/components/features/auth/AuthFields";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

const RESET_ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "This reset link is invalid. Please request a new one.",
  expired_token: "This reset link has expired. Please request a new one.",
  token_used: "This reset link has already been used. Please request a new one.",
  weak_password: "Password must be at least 8 characters.",
};

type Status = "checking" | "valid" | "invalid";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>(() => (token ? "checking" : "invalid"));
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/citizens/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setStatus(data.valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setStatus("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/citizens/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });

    if (res.ok) {
      router.push("/login?notice=password_reset");
    } else {
      const data = await res.json().catch(() => ({}));
      const code = typeof data.message === "string" ? data.message : "";
      setError(RESET_ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" description="Pick a new password for your citizen account.">
      {status === "checking" && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          Checking your reset link…
        </p>
      )}

      {status === "invalid" && (
        <div className="flex flex-col gap-(--auth-gap)">
          <AuthAlert tone="error">This reset link is invalid or has expired.</AuthAlert>
          <Button asChild className={AUTH_CTA_BUTTON}>
            <Link href="/forgot-password">
              <AuthCtaLabel>Request a new link</AuthCtaLabel>
            </Link>
          </Button>
          <AuthNote>
            <AuthLink href="/login">Back to Sign In</AuthLink>
          </AuthNote>
        </div>
      )}

      {status === "valid" && (
        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup className={AUTH_GROUP}>
            <Field>
              <FieldLabel htmlFor="newPassword">New password</FieldLabel>
              <PasswordInput
                id="newPassword"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>

            {error && <AuthAlert tone="error">{error}</AuthAlert>}

            <AuthButton type="submit" loading={submitting}>
              {submitting ? "Resetting…" : "Reset password"}
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
