import { Suspense } from "react";
import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import type { PaginatedModeration, ModerationStats } from "@/lib/types/admin-moderation";
import { FlaggedWorkspace } from "@/components/features/admin/flagged/FlaggedWorkspace";
import { FlaggedQueueSkeleton } from "@/components/features/admin/flagged/FlaggedQueueSkeleton";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

interface Barangay {
  id: number;
  name: string;
}

interface BarangaysGeoFeature {
  properties: { id: number; name: string };
}

async function FlaggedData({ query }: { query: Record<string, string | undefined> }) {
  const session = await getAdminSessionFromApi();

  const qs = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString();

  let initialData: PaginatedModeration;
  let initialStats: ModerationStats;
  let barangaysGeo: { features: BarangaysGeoFeature[] };
  try {
    [initialData, initialStats, barangaysGeo] = await Promise.all([
      apiGet<PaginatedModeration>(`/admin/moderation${qs ? `?${qs}` : ""}`),
      apiGet<ModerationStats>("/admin/moderation/stats"),
      apiGet<{ features: BarangaysGeoFeature[] }>("/admin/barangays/geo"),
    ]);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="Flagged Reports couldn't load live data from the API. The Dashboard and Ticket Queue are unaffected — try reloading this page in a moment."
        title="Flagged Reports Unavailable"
      />
    );
  }

  const barangays: Barangay[] = barangaysGeo.features.map((f) => f.properties);

  return (
    <FlaggedWorkspace
      barangays={barangays}
      initialData={initialData}
      initialQuery={query}
      initialStats={initialStats}
      sessionOffice={session?.office}
    />
  );
}

export default async function AdminFlaggedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <Suspense fallback={<FlaggedQueueSkeleton />}>
      <FlaggedData query={query} />
    </Suspense>
  );
}
