"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { AdminSession } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function emptyDraft() {
  return { currentPassword: "", newPassword: "", confirmPassword: "" };
}

export function AdminAccountSecurityPanel({ session }: { session: AdminSession | null }) {
  const [draft, setDraft] = useState(emptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (!session) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Sign in to manage your account.</CardContent></Card>;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    if (draft.newPassword !== draft.confirmPassword) {
      setMessage({ kind: "error", text: "New password and confirmation don't match." });
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/admin/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: draft.currentPassword, newPassword: draft.newPassword }),
    });

    if (res.ok) {
      setDraft(emptyDraft());
      setMessage({ kind: "success", text: "Password changed. Your other signed-in sessions have been signed out." });
    } else {
      const data = await res.json().catch(() => null);
      setMessage({ kind: "error", text: data?.message ?? "Couldn't change your password." });
    }
    setSubmitting(false);
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{session.adminName}</p>
            <p className="truncate text-sm text-muted-foreground">{session.email}</p>
          </div>
          <Badge variant="outline">{session.office ?? "All Offices"} · {session.role}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="current-password">Current password</label>
              <Input
                autoComplete="current-password"
                id="current-password"
                onChange={(e) => setDraft((d) => ({ ...d, currentPassword: e.target.value }))}
                required
                type="password"
                value={draft.currentPassword}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="new-password">New password</label>
              <Input
                autoComplete="new-password"
                id="new-password"
                minLength={8}
                onChange={(e) => setDraft((d) => ({ ...d, newPassword: e.target.value }))}
                required
                type="password"
                value={draft.newPassword}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="confirm-password">Confirm new password</label>
              <Input
                autoComplete="new-password"
                id="confirm-password"
                minLength={8}
                onChange={(e) => setDraft((d) => ({ ...d, confirmPassword: e.target.value }))}
                required
                type="password"
                value={draft.confirmPassword}
              />
            </div>
            {message && (
              <p aria-live="polite" className={`flex items-center gap-1.5 text-xs ${message.kind === "success" ? "text-emerald-600" : "text-destructive"}`} role="alert">
                {message.kind === "success" ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertCircle className="size-3.5 shrink-0" />}
                {message.text}
              </p>
            )}
            <Button disabled={submitting} type="submit">{submitting ? "Changing…" : "Change password"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
