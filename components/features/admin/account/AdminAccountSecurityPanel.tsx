"use client";

import { useState } from "react";
import { useAuthSubmit } from "@/components/features/auth/useAuthSubmit";
import { PasswordInput } from "@/components/features/auth/AuthFields";
import { Field, FieldLabel } from "@/components/ui/field";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { AdminSession } from "@/lib/auth/session";
import { staffDescription } from "@/lib/utils/adminScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function emptyDraft() {
  return { currentPassword: "", newPassword: "", confirmPassword: "" };
}

export function AdminAccountSecurityPanel({ session }: { session: AdminSession | null }) {
  const [draft, setDraft] = useState(emptyDraft());
  const [success, setSuccess] = useState("");
  const { error, submitting, clearError, submit } = useAuthSubmit({ keepPendingOnSuccess: false });

  if (!session) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Sign in to manage your account.</CardContent></Card>;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    return submit(e, async () => {
      setSuccess("");
      if (draft.newPassword !== draft.confirmPassword) {
        return "New password and confirmation don't match.";
      }

      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: draft.currentPassword, newPassword: draft.newPassword }),
      });

      if (res.ok) {
        setDraft(emptyDraft());
        setSuccess("Password changed. Your other signed-in sessions have been signed out.");
        return;
      }
      const data = await res.json().catch(() => null);
      return data?.message ?? "Couldn't change your password.";
    });
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{session.adminName}</p>
            <p className="truncate text-sm text-muted-foreground">{session.email}</p>
          </div>
          <Badge variant="outline">{staffDescription(session)}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSubmit} onChange={clearError}>
            <Field className="gap-1">
              <FieldLabel className="text-xs font-medium text-muted-foreground" htmlFor="current-password">Current password</FieldLabel>
              <PasswordInput
                className="h-8 md:text-sm"
                autoComplete="current-password"
                id="current-password"
                onChange={(e) => setDraft((d) => ({ ...d, currentPassword: e.target.value }))}
                required
                value={draft.currentPassword}
              />
            </Field>
            <Field className="gap-1">
              <FieldLabel className="text-xs font-medium text-muted-foreground" htmlFor="new-password">New password</FieldLabel>
              <PasswordInput
                className="h-8 md:text-sm"
                autoComplete="new-password"
                id="new-password"
                minLength={8}
                onChange={(e) => setDraft((d) => ({ ...d, newPassword: e.target.value }))}
                required
                value={draft.newPassword}
              />
            </Field>
            <Field className="gap-1">
              <FieldLabel className="text-xs font-medium text-muted-foreground" htmlFor="confirm-password">Confirm new password</FieldLabel>
              <PasswordInput
                className="h-8 md:text-sm"
                autoComplete="new-password"
                id="confirm-password"
                minLength={8}
                onChange={(e) => setDraft((d) => ({ ...d, confirmPassword: e.target.value }))}
                required
                value={draft.confirmPassword}
              />
            </Field>
            {(error || success) && (
              <p aria-live="polite" className={`flex items-center gap-1.5 text-xs ${!error ? "text-status-resolved-ink" : "text-destructive"}`} role="alert">
                {!error ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertCircle className="size-3.5 shrink-0" />}
                {error || success}
              </p>
            )}
            <Button disabled={submitting} type="submit">{submitting ? "Changing…" : "Change password"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
