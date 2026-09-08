import { apiGet } from "@/lib/api-client";
import type { FocalIntakeRow } from "@/lib/types/admin-focal-intake";
import { FocalDashboard } from "@/components/features/admin/focal/FocalDashboard";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

export default async function FocalDashboardPage() {
  let rows: FocalIntakeRow[];
  try {
    rows = await apiGet<FocalIntakeRow[]>("/admin/intake");
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="The Focal Dashboard couldn't load live data from the API. Try reloading this page in a moment."
        title="Focal Dashboard Unavailable"
      />
    );
  }

  return <FocalDashboard rows={rows} />;
}
