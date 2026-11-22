"use client";

import { useRef, useState } from "react";

export function useAuthSubmit({ keepPendingOnSuccess = true } = {}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const edits = useRef(0);

  function clearError() {
    edits.current++;
    setError("");
  }

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    request: (form: FormData) => Promise<string | undefined>,
  ) {
    event.preventDefault();
    if (pending.current) return;

    const form = new FormData(event.currentTarget);
    const submittedAt = edits.current;
    pending.current = true;
    setSubmitting(true);

    let failure: string | undefined;
    try {
      failure = await request(form);
    } catch {
      failure = "Could not reach the server. Please try again.";
    }

    // Public auth forms stay busy until the successful navigation or form replacement.
    if (failure === undefined && keepPendingOnSuccess) return;
    if (submittedAt === edits.current) setError(failure ?? "");
    pending.current = false;
    setSubmitting(false);
  }

  return { error, submitting, clearError, submit };
}
