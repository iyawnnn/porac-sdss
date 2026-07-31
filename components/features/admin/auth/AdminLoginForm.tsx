"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, ShieldCheck } from "lucide-react";
import { MUNICIPALITY } from "@/lib/municipality-config";

export default function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Visual panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-900 lg:flex lg:flex-col lg:justify-between">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
          viewBox="0 0 400 800"
          fill="none"
          aria-hidden="true"
        >
          {[80, 160, 240, 320, 400, 480, 560, 640, 720].map((y, i) => (
            <path
              key={y}
              d={`M -40 ${y} C 80 ${y - 40 + (i % 2) * 20}, 160 ${y + 40 - (i % 2) * 20}, 280 ${y} S 480 ${y - 30}, 560 ${y}`}
              stroke="white"
              strokeWidth="1.5"
            />
          ))}
        </svg>

        <div className="relative z-10 flex items-center gap-3 p-10">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-sm font-semibold tracking-wide text-white">PORAC SDSS</p>
            <p className="text-xs text-white/70">
              Spatial Decision Support System | LGU Command Center
            </p>
          </div>
        </div>

        <div className="relative z-10 p-10">
          <p className="text-xl font-medium leading-snug text-white text-balance">
            Authorized Personnel Only. Municipal Engineer&apos;s Office (MEO) &amp; MDRRMO Dispatch
            Portal.
          </p>
          <p className="mt-4 text-sm text-white/70">Local Government Unit of {MUNICIPALITY.name}</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-slate-900/5 px-2.5 py-1 text-[10px] font-bold tracking-[0.06em] text-slate-700 uppercase">
            Official Access Portal
          </span>

          <h1 className="mt-4 text-base font-semibold tracking-[-0.01em] text-ink-900">
            LGU Admin Portal
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            Enter your municipal credentials to access the command center.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-3">
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
                placeholder="officer@porac.gov.ph"
                autoComplete="email"
                required
                className="h-9 w-full rounded-md border border-line-200 bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-[11px] font-medium tracking-[0.04em] text-ink-700 uppercase"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
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
              <p role="alert" aria-live="polite" className="flex items-center gap-2 text-xs text-urgency-critical-ink">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="h-9 w-full rounded-md bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2"
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-ink-500">
            Account access restricted. Contact LGU IT Administrator for access requests.
          </p>
        </div>
      </div>
    </main>
  );
}
