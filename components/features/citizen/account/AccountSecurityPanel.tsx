"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuthSubmit } from "@/components/features/auth/useAuthSubmit";
import { PasswordInput, PasswordRequirement } from "@/components/features/auth/AuthFields";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { SecurityStatus } from "@/lib/types/citizens-account";
import { cn } from "@/lib/utils";

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

const INPUT = "h-11 rounded-lg border-input bg-background pl-3.5 text-base md:text-sm dark:bg-background";
const LABEL = "text-sm font-medium text-foreground";
const PENDING_BUTTON = "h-10 gap-2 px-4 active:not-aria-[haspopup]:translate-y-0";

// A settings section: what it is on the left, the controls on the right (stacked on phones).
export function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border py-6 last:border-b-0 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-8">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Notice({ kind, children }: { kind: "success" | "error"; children: React.ReactNode }) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <p
      role="alert"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm",
        kind === "success"
          ? "border-status-resolved-dot/30 bg-status-resolved-tint text-status-resolved-ink"
          : "border-danger-edge bg-danger-tint text-danger-ink",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

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

  const newPasswordField = (
    <Field className="gap-1.5">
      <FieldLabel htmlFor="newPassword" className={LABEL}>New password</FieldLabel>
      <PasswordInput
        autoComplete="new-password"
        id="newPassword"
        required
        minLength={8}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        aria-describedby="new-password-hint"
        className={INPUT}
      />
      <PasswordRequirement id="new-password-hint" password={newPassword} />
    </Field>
  );

  return (
    <>
      {message && <div className="pt-6"><Notice kind={message.kind}>{message.text}</Notice></div>}

      <SettingsSection
        title="Password"
        description={status.hasPassword ? "Change the password you use to sign in." : "You sign in with Google. Add a password to sign in with your email too."}
      >
        {status.hasPassword || reauthedProvider ? (
          <form onSubmit={handlePasswordSubmit} onChange={clearError} noValidate className="flex max-w-md flex-col gap-4">
            {!status.hasPassword && <p className="text-sm text-muted-foreground">Verified. Set a password for your account.</p>}
            {status.hasPassword && (
              <Field className="gap-1.5">
                <FieldLabel htmlFor="currentPassword" className={LABEL}>Current password</FieldLabel>
                <PasswordInput
                  autoComplete="current-password"
                  id="currentPassword"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={INPUT}
                />
              </Field>
            )}
            {newPasswordField}
            {passwordError && <Notice kind="error">{passwordError}</Notice>}
            <Button type="submit" disabled={passwordBusy} aria-busy={passwordBusy} className={cn(PENDING_BUTTON, "w-fit hover:bg-primary-hover")}>
              {status.hasPassword ? (passwordBusy ? "Changing password" : "Change password") : passwordBusy ? "Setting password" : "Set password"}
              {passwordBusy && <Spinner aria-hidden="true" className="motion-reduce:animate-none" />}
            </Button>
          </form>
        ) : (
          <div className="flex max-w-md flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Not set. Verify your identity first to add one.</p>
            {status.providers.google && (
              <Button asChild variant="outline" className={PENDING_BUTTON}>
                <a href="/api/auth/google?mode=reauth">Verify with Google</a>
              </Button>
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Sign-in methods" description="Accounts you can use to sign in to PORAC-SDSS.">
        <ul className="flex max-w-md flex-col divide-y divide-border rounded-lg border border-border">
          {(["google"] as const).map((provider) => {
            const linked = status.providers[provider];
            return (
              <li key={provider} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{PROVIDER_LABEL[provider]}</p>
                  <p className="text-xs text-muted-foreground">{linked ? "Linked" : "Not linked"}</p>
                </div>
                {linked ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleUnlink(provider)}
                    disabled={unlinkBusy === provider}
                    aria-busy={unlinkBusy === provider}
                    className={PENDING_BUTTON}
                  >
                    {unlinkBusy === provider ? "Unlinking" : "Unlink"}
                    {unlinkBusy === provider && <Spinner aria-hidden="true" className="motion-reduce:animate-none" />}
                  </Button>
                ) : (
                  <Button asChild variant="outline" className={PENDING_BUTTON}>
                    <a href={`/api/auth/${provider}?mode=link`}>Link</a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsSection>
    </>
  );
}
