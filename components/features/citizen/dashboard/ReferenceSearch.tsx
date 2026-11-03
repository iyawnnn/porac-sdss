"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REFERENCE_NOT_FOUND, normalizeReferenceInput } from "@/lib/utils/tracking-reference";

// Find one of your own reports by its tracking reference (manuscript
// revision Phase 6, step 6b). Owner-only: the API answers the same 404 for a
// reference that does not exist and for another citizen's, so this shows
// the same neutral message for both.
export function ReferenceSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ref = normalizeReferenceInput(value);
    if (!ref) {
      setMessage("Enter a tracking reference like PRC-2026-000123.");
      return;
    }
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reports/mine/by-reference/${encodeURIComponent(ref)}`);
      if (res.ok) {
        const { id } = (await res.json()) as { id: number };
        router.push(`/dashboard/reports/${id}`);
        return;
      }
      setMessage(
        res.status === 404
          ? REFERENCE_NOT_FOUND
          : res.status === 429
            ? "Too many lookups. Try again in a minute."
            : "Something went wrong. Please try again.",
      );
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-line-200 bg-surface p-5" role="search" aria-label="Find a report by tracking reference">
      <label htmlFor="tracking-reference" className="block text-sm font-medium text-ink-900">
        Find a report by tracking reference
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id="tracking-reference"
          name="tracking-reference"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="PRC-2026-000123"
          autoComplete="off"
          aria-describedby={message ? "tracking-reference-message" : undefined}
          className="font-mono sm:max-w-xs"
        />
        <Button type="submit" disabled={searching}>
          {searching ? "Searching..." : "Find report"}
        </Button>
      </div>
      <div aria-live="polite">
        {message && (
          <p id="tracking-reference-message" className="mt-2 text-sm text-ink-700">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
