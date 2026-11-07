import { getAdminSessionFromApi } from "@/lib/api-client";
import { isOperationalPersonnel } from "@/lib/utils/adminScope";
import { ALL_TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/types/admin-ticket-constants";
import MapClientLoader from "@/components/features/admin/map/MapClientLoader";
import type { MapFilterState } from "@/components/features/admin/map/MapFilterBar";
import { AdminAccessDenied } from "@/components/features/admin/shared/AdminAccessDenied";

type MapLayer = "pins" | "heatmap";

interface MapSearchParams {
  office?: string;
  category?: string;
  status?: string;
  barangayName?: string;
  search?: string;
  layer?: string;
}

// Mirrors TicketsService.parseTicketQuery's validate-or-fall-back-to-default
// shape (api/src/admin/tickets.service.ts) so an unknown/invalid query param
// never reaches the client as a filter that silently matches nothing. The
// retired Hazard Urgency filter (?urgency=) is simply not read any more
// (manuscript revision Phase 1, step 5), so an old link opens the map with
// its other filters applied.
function parseMapFilters(params: MapSearchParams): { filters: MapFilterState; layer: MapLayer } {
  const category = (ALL_TICKET_CATEGORIES as readonly string[]).includes(params.category ?? "") ? (params.category as string) : "";
  const status = (TICKET_STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as string) : "";
  const barangayName = params.barangayName?.trim() || "";
  const search = params.search?.trim() || "";
  const layer = params.layer === "heatmap" ? "heatmap" : "pins";
  return { filters: { category, status, barangayName, search }, layer };
}

export default async function AdminMapPage({
  searchParams,
}: {
  searchParams: Promise<MapSearchParams>;
}) {
  const params = await searchParams;
  const session = await getAdminSessionFromApi();
  // The API remains authoritative; keep its operational-only boundary visible here too.
  if (session && !isOperationalPersonnel(session)) return <AdminAccessDenied />;
  const office = session?.office ?? undefined;

  const { filters, layer } = parseMapFilters(params);

  return <MapClientLoader initialFilters={filters} initialLayer={layer} isSystemAdmin={false} office={office} />;
}
