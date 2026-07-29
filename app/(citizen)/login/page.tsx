"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CitizenLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/citizens/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-sm mx-auto p-6 mt-16">
      <h1 className="text-xl font-bold mb-4">Log In</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input name="email" type="email" placeholder="Email" required className="w-full border p-2" />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="w-full border p-2"
        />
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {submitting ? "Logging in..." : "Log in"}
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </form>
      <p className="text-sm mt-4">
        No account?{" "}
        <Link href="/signup" className="text-blue-600 underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
