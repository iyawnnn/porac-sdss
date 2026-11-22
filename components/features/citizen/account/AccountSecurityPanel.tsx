"use client";

import { useState } from "react";
import { useAuthSubmit } from "@/components/features/auth/useAuthSubmit";
import { PasswordInput } from "@/components/features/auth/AuthFields";
import { Field, FieldLabel } from "@/components/ui/field";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { SecurityStatus } from "@/lib/types/citizens-account";

type Provider = "google";

const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google",
};

const ERROR_MESSAGES: Record<string, string> = {
  identity_conflict:
    "That account is already linked elsewhere and can't be linked to this account.",
  reauth_failed: "We couldn't verify that account. Please try again.",
  oauth_failed: "Something went wrong. Please try again.",
};

export default function AccountSecurityPanel({ initial }: { initial: SecurityStatus }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(initial);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(
    (() => {
      const linked = searchParams.get("linked");
      const errorCode = searchParams.get("error");
      const reauth = searchParams.get("reauth");
      if (linked) return { kind: "success", text: `${PROVIDER_LABEL[linked as Provider] ?? linked} linked successfully.` };
      if (errorCode) return { kind: "error", text: ERROR_MESSAGES[errorCode] ?? "Something went wrong." };
      if (reauth) return { kind: "success", text: "Verified. You can now continue below." };
      return null;
    })(),
  );
  const reauthedProvider = searchParams.get("reauth") as Provider | null;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { error: passwordError, submitting: passwordBusy, clearError, submit } = useAuthSubmit({ keepPendingOnSuccess: false });

  const [unlinkBusy, setUnlinkBusy] = useState<Provider | null>(null);

  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    return submit(e, async () => {
      const res = await fetch("/api/citizens/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          status.hasPassword ? { currentPassword, newPassword } : { newPassword },
        ),
      });

      if (res.ok) {
        setStatus((s) => ({ ...s, hasPassword: true }));
        setCurrentPassword("");
        setNewPassword("");
        setMessage({ kind: "success", text: status.hasPassword ? "Password changed." : "Password set." });
        router.replace("/account");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      return data.message ?? "Couldn't update your password.";
    });
  }

  async function handleUnlink(provider: Provider) {
    setUnlinkBusy(provider);
    const res = await fetch(`/api/citizens/account/identities/${provider}`, { method: "DELETE" });

    if (res.status === 428) {
      window.location.assign(`/api/auth/${provider}?mode=reauth`);
      return;
    }
    if (res.ok) {
      setStatus((s) => ({ ...s, providers: { ...s.providers, [provider]: false } }));
      setMessage({ kind: "success", text: `${PROVIDER_LABEL[provider]} unlinked.` });
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage({ kind: "error", text: data.message ?? "Couldn't unlink that provider." });
    }
    setUnlinkBusy(null);
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {message && (
        <p
          role="alert"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            message.kind === "success"
              ? "border-status-resolved-ink/20 bg-status-resolved-tint text-status-resolved-ink"
              : "border-danger-ink/20 bg-danger-ink/5 text-danger-ink"
          }`}
        >
          {message.kind === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {message.text}
        </p>
      )}

      <section className="rounded-xl border border-line-200 bg-surface p-6">
        <h2 className="text-[18px] font-semibold leading-[26px] text-ink-900">Password</h2>

        {status.hasPassword ? (
          <form onSubmit={handlePasswordSubmit} onChange={clearError} noValidate className="mt-4 space-y-3">
            <p className="text-sm text-ink-500">Password configured.</p>
            <Field className="gap-1">
              <FieldLabel htmlFor="currentPassword" className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-700">
                Current password
              </FieldLabel>
              <PasswordInput
                autoComplete="current-password"
                id="currentPassword"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-9 rounded-md border-line-200 bg-surface pl-3 text-sm text-ink-900 md:text-sm dark:bg-surface"
              />
            </Field>
            <Field className="gap-1">
              <FieldLabel htmlFor="newPassword" className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-700">
                New password
              </FieldLabel>
              <PasswordInput
                autoComplete="new-password"
                id="newPassword"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 rounded-md border-line-200 bg-surface pl-3 text-sm text-ink-900 md:text-sm dark:bg-surface"
              />
            </Field>
            {passwordError && <p role="alert" className="text-xs text-danger-ink">{passwordError}</p>}
            <button
              type="submit"
              disabled={passwordBusy}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {passwordBusy ? "Changing…" : "Change password"}
            </button>
          </form>
        ) : reauthedProvider ? (
          <form onSubmit={handlePasswordSubmit} onChange={clearError} noValidate className="mt-4 space-y-3">
            <p className="text-sm text-ink-500">Verified — set a password for your account.</p>
            <Field className="gap-1">
              <FieldLabel htmlFor="newPassword" className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-700">
                New password
              </FieldLabel>
              <PasswordInput
                autoComplete="new-password"
                id="newPassword"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 rounded-md border-line-200 bg-surface pl-3 text-sm text-ink-900 md:text-sm dark:bg-surface"
              />
            </Field>
            {passwordError && <p role="alert" className="text-xs text-danger-ink">{passwordError}</p>}
            <button
              type="submit"
              disabled={passwordBusy}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {passwordBusy ? "Setting…" : "Set password"}
            </button>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink-500">Not configured. Verify your identity to set one.</p>
            <div className="flex gap-2">
              {status.providers.google && (
                <a
                  href="/api/auth/google?mode=reauth"
                  className="h-9 rounded-md border border-line-200 px-4 text-sm font-medium text-ink-700 hover:bg-line-100 inline-flex items-center"
                >
                  Verify with Google
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line-200 bg-surface p-6">
        <h2 className="text-[18px] font-semibold leading-[26px] text-ink-900">Linked providers</h2>
        <div className="mt-4 flex flex-col gap-3">
          {(["google"] as const).map((provider) => {
            const linked = status.providers[provider];
            return (
              <div
                key={provider}
                className="flex items-center justify-between rounded-lg border border-line-200 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{PROVIDER_LABEL[provider]}</p>
                  <p className="text-xs text-ink-500">{linked ? "Linked" : "Not linked"}</p>
                </div>
                {linked ? (
                  <button
                    type="button"
                    onClick={() => handleUnlink(provider)}
                    disabled={unlinkBusy === provider}
                    className="h-9 rounded-md border border-line-200 px-4 text-sm font-medium text-ink-700 hover:bg-line-100 disabled:opacity-60"
                  >
                    {unlinkBusy === provider ? "Unlinking…" : "Unlink"}
                  </button>
                ) : (
                  <a
                    href={`/api/auth/${provider}?mode=link`}
                    className="h-9 rounded-md border border-line-200 px-4 text-sm font-medium text-ink-700 hover:bg-line-100 inline-flex items-center"
                  >
                    Link
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
