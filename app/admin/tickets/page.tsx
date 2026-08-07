import { Suspense } from "react";
import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import type { PaginatedTickets } from "@/lib/types/admin-tickets";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { TicketsWorkspace } from "@/components/features/admin/tickets/TicketsWorkspace";
import { TicketQueueSkeleton } from "@/components/features/admin/tickets/TicketQueueSkeleton";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

interface Barangay {
  id: number;
  name: string;
}

interface BarangaysGeoFeature {
  properties: { id: number; name: string };
}

interface RecomputeResult {
  updated: number;
  rain1hMm: number;
}

type TicketsResponse = PaginatedTickets & { recompute: RecomputeResult };

async function TicketsData({ query }: { query: Record<string, string | undefined> }) {
  const session = await getAdminSessionFromApi();

  const qs = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString();

  let initialData: TicketsResponse;
  let barangaysGeo: { features: BarangaysGeoFeature[] };
  try {
    [initialData, barangaysGeo] = await Promise.all([
      apiGet<TicketsResponse>(`/admin/tickets${qs ? `?${qs}` : ""}`),
      apiGet<{ features: BarangaysGeoFeature[] }>("/admin/barangays/geo"),
    ]);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="The ticket queue couldn't load live data from the API. The Dashboard and Interactive Map are unaffected — try reloading this page in a moment."
        title="Ticket Queue Unavailable"
      />
    );
  }

  const barangays: Barangay[] = barangaysGeo.features.map((f) => f.properties);
  const { recompute: initialRecompute, ...paginated } = initialData;

  return (
    <TicketsWorkspace
      initialData={paginated}
      initialQuery={query}
      initialRecompute={initialRecompute}
      barangays={barangays}
      sessionOffice={session?.office ?? undefined}
      isSystemAdmin={session ? isSystemAdmin(session) : false}
    />
  );
}

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <Suspense fallback={<TicketQueueSkeleton />}>
      <TicketsData query={query} />
    </Suspense>
  );
}
