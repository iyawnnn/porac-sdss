"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Suggested targets only — the manuscript's explicit referral examples.
// Backend validates agency as free text (REFERRAL_AGENCY_MAX_LENGTH), so
// "Other" falls through to a free-text input rather than a hard enum.
const SUGGESTED_AGENCIES = [
  "MENRO",
  "DPWH",
  "Water utility provider",
  "Electric utility provider",
  "Barangay office",
  "Other",
];

export function ReferralPanel({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [agency, setAgency] = useState(SUGGESTED_AGENCIES[0]);
  const [customAgency, setCustomAgency] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const resolvedAgency = agency === "Other" ? customAgency.trim() : agency;
    if (!resolvedAgency) {
      setError("Agency is required");
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/admin/tickets/${ticketId}/refer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency: resolvedAgency, note: note.trim() || undefined }),
    });

    if (res.ok) {
      setNote("");
      setCustomAgency("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Referral failed");
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">
        This category is a referral/coordination concern, not this office&apos;s direct responsibility. Log who it was
        referred to for the record.
      </p>
      <Select onValueChange={setAgency} value={agency}>
        <SelectTrigger aria-label="Referral agency" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SUGGESTED_AGENCIES.map((a) => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {agency === "Other" && (
        <input
          aria-label="Referral agency name"
          className="w-full rounded-md border border-line-200 px-3 py-1.5 text-sm"
          onChange={(e) => setCustomAgency(e.target.value)}
          placeholder="Agency name"
          value={customAgency}
        />
      )}
      <Textarea
        aria-label="Referral note"
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (contact, reference number, context)"
        value={note}
      />
      <Button disabled={submitting} onClick={handleSubmit} size="sm" variant="outline">
        {submitting ? "Recording..." : "Log Referral"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
