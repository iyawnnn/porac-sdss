"use client";

import { CitizenErrorState } from "@/components/features/citizen/dashboard/CitizenErrorState";

export default function CitizenMapError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <CitizenErrorState backHref="/dashboard" backLabel="Back to Dashboard" unstable_retry={unstable_retry} title="Couldn't load the hazard map" />;
}
