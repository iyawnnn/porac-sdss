"use client";

import { CitizenErrorState } from "@/components/features/citizen/dashboard/CitizenErrorState";

export default function ReportDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CitizenErrorState backHref="/reports" backLabel="Back to My Reports" reset={reset} title="Couldn't load this report" />;
}
