import { apiGet } from "@/lib/api-client";
import type { FocalIntakeGeoRow } from "@/lib/types/admin-focal-intake";
import FocalMapLoader from "@/components/features/admin/focal/FocalMapLoader";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

export default async function FocalMapPage() {
  let reports: FocalIntakeGeoRow[];
  try {
    reports = await apiGet<FocalIntakeGeoRow[]>("/admin/intake/geo");
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="The Interactive Map couldn't load live data from the API. Try reloading this page in a moment."
        title="Interactive Map Unavailable"
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.02em]">Interactive Map</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Municipality-wide incoming report locations relevant to intake. Read-only — no operational controls.</p>
      </div>
      <div className="h-[calc(100vh-220px)] min-h-96 overflow-hidden rounded-xl border border-border">
        <FocalMapLoader reports={reports} />
      </div>
    </div>
  );
}
