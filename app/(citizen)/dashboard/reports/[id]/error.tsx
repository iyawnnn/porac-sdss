"use client";

import { CitizenErrorState } from "@/components/features/citizen/dashboard/CitizenErrorState";

export default function ReportDetailError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <CitizenErrorState backHref="/reports" backLabel="Back to My Reports" unstable_retry={unstable_retry} title="Couldn't load this report" />;
}
