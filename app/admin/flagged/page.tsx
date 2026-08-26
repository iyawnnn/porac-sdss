import { Suspense } from "react";
import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import type { PaginatedModeration, ModerationStats } from "@/lib/types/admin-moderation";
import type { SavedView } from "@/lib/types/admin-tickets";
import { isSystemAdmin } from "@/lib/utils/adminScope";
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

  // Fetched separately and allowed to fail: a saved view is a personal
  // convenience, not part of the moderation queue itself — the five built-in
  // view tabs, the filters and the table all work with no saved views at all.
  // Putting it in the Promise.all would make a cosmetic feature load-bearing
  // for a review surface. `surface=flagged` is what keeps the Ticket Queue's
  // presets out of this strip.
  const savedViews: SavedView[] = await apiGet<SavedView[]>(
    "/admin/saved-views?surface=flagged",
  ).catch(() => []);

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
      initialSavedViews={savedViews}
      initialStats={initialStats}
      sessionOffice={session?.office ?? undefined}
      isSystemAdmin={session ? isSystemAdmin(session) : false}
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
