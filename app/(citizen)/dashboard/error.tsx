"use client";

import { CitizenErrorState } from "@/components/features/citizen/dashboard/CitizenErrorState";

export default function DashboardError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <CitizenErrorState backHref="/reports" backLabel="Go to My Reports" unstable_retry={unstable_retry} title="Couldn't load your dashboard" />;
}
