import { apiGet } from "@/lib/api-client";
import type { FocalIntakeRow } from "@/lib/types/admin-focal-intake";
import { FocalIntakeQueue } from "@/components/features/admin/focal/FocalIntakeQueue";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

export default async function FocalIntakeQueuePage() {
  let rows: FocalIntakeRow[];
  try {
    rows = await apiGet<FocalIntakeRow[]>("/admin/intake");
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="The Intake Queue couldn't load live data from the API. Try reloading this page in a moment."
        title="Intake Queue Unavailable"
      />
    );
  }

  return <FocalIntakeQueue initialRows={rows} />;
}
