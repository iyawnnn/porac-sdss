"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Radar } from "lucide-react";
import { MUNICIPALITY } from "@/lib/municipality-config";

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
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10 flex items-center gap-3 p-10">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white">
            <Radar className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-sm font-semibold tracking-wide text-white">PORAC SDSS</p>
            <p className="text-xs text-white/70">Spatial Decision Support System</p>
          </div>
        </div>
        <div className="relative z-10 p-10">
          <p className="text-xl font-medium leading-snug text-white text-balance">
            {`Choose a new password to get back into ${MUNICIPALITY.name}'s hazard reporting portal.`}
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
            Choose a new password
          </h1>

          {status === "checking" && (
            <p className="mt-4 text-xs text-ink-500">Checking your reset link…</p>
          )}

          {status === "invalid" && (
            <div className="mt-4 space-y-3">
              <p
                role="alert"
                aria-live="polite"
                className="flex items-center gap-2 rounded-md border border-urgency-critical-ink/20 bg-urgency-critical-ink/5 px-3 py-2 text-xs text-urgency-critical-ink"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                This reset link is invalid or has expired.
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex h-9 items-center rounded-md bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
              >
                Request a new link
              </Link>
            </div>
          )}

          {status === "valid" && (
            <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="newPassword"
                  className="mb-1 block text-[11px] font-medium tracking-[0.04em] text-ink-700 uppercase"
                >
                  New password
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 w-full rounded-md border border-line-200 bg-surface px-3 pr-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-400 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="flex items-center gap-2 text-xs text-urgency-critical-ink"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="h-9 w-full rounded-md bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                {submitting ? "Resetting…" : "Reset password"}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-ink-500">
            <Link href="/login" className="font-medium text-brand-500 hover:text-brand-600">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
