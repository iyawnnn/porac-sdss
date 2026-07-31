import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import type { PaginatedTickets } from "@/lib/types/admin-tickets";
import { TicketsWorkspace } from "@/components/features/admin/tickets/TicketsWorkspace";

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

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const session = await getAdminSessionFromApi();

  const qs = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString();

  const [initialData, barangaysGeo] = await Promise.all([
    apiGet<TicketsResponse>(`/admin/tickets${qs ? `?${qs}` : ""}`),
    apiGet<{ features: BarangaysGeoFeature[] }>("/admin/barangays/geo"),
  ]);

  const barangays: Barangay[] = barangaysGeo.features.map((f) => f.properties);
  const { recompute: initialRecompute, ...paginated } = initialData;

  return (
    <TicketsWorkspace
      initialData={paginated}
      initialQuery={query}
      initialRecompute={initialRecompute}
      barangays={barangays}
      sessionOffice={session?.office}
    />
  );
}
