import { ApiError, apiGet } from "@/lib/api-client";
import type { FocalIntakeRow } from "@/lib/types/admin-focal-intake";
import { FocalIntakeQueue } from "@/components/features/admin/focal/FocalIntakeQueue";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";
import { AdminAccessDenied } from "@/components/features/admin/shared/AdminAccessDenied";

export default async function FocalIntakeQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ flagged?: string }>;
}) {
  const { flagged } = await searchParams;
  let rows: FocalIntakeRow[];
  try {
    rows = await apiGet<FocalIntakeRow[]>("/admin/intake");
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return <AdminAccessDenied />;
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="The Intake Queue couldn't load live data from the API. Try reloading this page in a moment."
        title="Intake Queue Unavailable"
      />
    );
  }

  return <FocalIntakeQueue initialFlaggedOnly={flagged === "true"} initialRows={rows} />;
}
