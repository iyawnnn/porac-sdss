"use client";

import { CitizenErrorState } from "@/components/features/citizen/dashboard/CitizenErrorState";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CitizenErrorState backHref="/reports" backLabel="Go to My Reports" reset={reset} title="Couldn't load your dashboard" />;
}
