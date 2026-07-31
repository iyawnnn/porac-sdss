"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, AlertCircle, Radar } from "lucide-react";
import { MUNICIPALITY } from "@/lib/municipality-config";

export default function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/citizens/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
      }),
    });

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Sign up failed");
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Visual panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 lg:flex lg:flex-col lg:justify-between">
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
            <Radar className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-sm font-semibold tracking-wide text-white">PORAC SDSS</p>
            <p className="text-xs text-white/70">Spatial Decision Support System</p>
          </div>
        </div>

        <div className="relative z-10 p-10">
          <p className="text-xl font-medium leading-snug text-white text-balance">
            {`“Reporting local hazards has never been easier. This platform helps us keep ${MUNICIPALITY.name} safe for everyone.”`}
          </p>
          <p className="mt-4 text-sm text-white/70">Citizen of {MUNICIPALITY.name}</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
            Create your Account
          </h1>
          <p className="mt-1 text-xs text-ink-500">Sign up to start reporting hazards.</p>

          <button
            type="button"
            disabled
            title="Google sign-in is coming soon"
            className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line-200 text-xs font-medium text-ink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon className="h-3.5 w-3.5" />
            Sign up with Google
          </button>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-line-200" />
            <span className="text-[10px] font-medium tracking-[0.04em] text-ink-400 uppercase">
              Or continue with email
            </span>
            <span className="h-px flex-1 bg-line-200" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="firstName"
                  className="mb-1 block text-[11px] font-medium tracking-[0.04em] text-ink-700 uppercase"
                >
                  First name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="Juan"
                  autoComplete="given-name"
                  required
                  className="h-9 w-full rounded-md border border-line-200 bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                />
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="mb-1 block text-[11px] font-medium tracking-[0.04em] text-ink-700 uppercase"
                >
                  Last name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  placeholder="Dela Cruz"
                  autoComplete="family-name"
                  required
                  className="h-9 w-full rounded-md border border-line-200 bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                />
              </div>
            </div>

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
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  minLength={8}
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
              className="h-9 w-full rounded-md bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {submitting ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-ink-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-500 hover:text-brand-600">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.48a5.54 5.54 0 0 1-2.4 3.64v3.02h3.89c2.28-2.1 3.55-5.18 3.55-8.85Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}
