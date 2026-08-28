"use client";

import { CitizenErrorState } from "@/components/features/citizen/dashboard/CitizenErrorState";

export default function AccountError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <CitizenErrorState error={error} unstable_retry={unstable_retry} title="Couldn't load your account settings" />;
}
