"use client";

import { CitizenErrorState } from "@/components/features/citizen/dashboard/CitizenErrorState";

export default function ReportFormError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CitizenErrorState backHref="/dashboard" backLabel="Back to Dashboard" reset={reset} title="Couldn't load the report form" />;
}
