"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/layouts/BrandLogo";
import { MUNICIPALITY } from "@/lib/municipality-config";

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
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#07291a] via-[#0c4720] to-[#145e37] lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10 flex flex-col items-start gap-3 p-10">
          <BrandLogo tone="dark" height={40} priority />
          <div>
            <p className="text-xs text-white/70">Web-Based Decision Support System</p>
          </div>
        </div>
        <div className="relative z-10 p-10">
          <p className="text-xl font-medium leading-snug text-white text-balance">
            {`Locked out of your account? We'll help you get back into ${MUNICIPALITY.name}'s hazard reporting portal.`}
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <BrandLogo height={28} className="mb-8 lg:hidden" />
          <h1 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
            Reset your password
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            Enter your email and, if you have a password-based account, we&apos;ll send you a
            link to reset it.
          </p>

          {submitted ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 flex items-center gap-2 rounded-md border border-status-resolved-ink/20 bg-status-resolved-tint px-3 py-2 text-xs text-status-resolved-ink"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              If an account exists for that email, we&apos;ve sent a link to reset your password.
            </p>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-[11px] font-medium tracking-[0.04em] text-ink-700 uppercase"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                  className="h-9 w-full rounded-md border border-line-200 bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="flex items-center gap-2 text-xs text-danger-ink"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-ink-500">
            <Link href="/login" className="font-medium text-primary hover:text-primary/80">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
