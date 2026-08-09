import { getAdminSessionFromApi } from "@/lib/api-client";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/types/admin-ticket-constants";
import MapClientLoader from "@/components/features/admin/map/MapClientLoader";
import type { MapFilterState } from "@/components/features/admin/map/MapFilterBar";

const URGENCY_BANDS = ["Low", "Medium", "Critical"];
type MapLayer = "pins" | "heatmap";

interface MapSearchParams {
  office?: string;
  category?: string;
  urgency?: string;
  status?: string;
  barangayName?: string;
  search?: string;
  layer?: string;
}

// Mirrors TicketsService.parseTicketQuery's validate-or-fall-back-to-default
// shape (api/src/admin/tickets.service.ts) so an unknown/invalid query param
// never reaches the client as a filter that silently matches nothing.
function parseMapFilters(params: MapSearchParams): { filters: MapFilterState; layer: MapLayer } {
  const category = (TICKET_CATEGORIES as readonly string[]).includes(params.category ?? "") ? (params.category as string) : "";
  const urgency = URGENCY_BANDS.includes(params.urgency ?? "") ? (params.urgency as string) : "";
  const status = (TICKET_STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as string) : "";
  const barangayName = params.barangayName?.trim() || "";
  const search = params.search?.trim() || "";
  const layer = params.layer === "heatmap" ? "heatmap" : "pins";
  return { filters: { category, urgency, status, barangayName, search }, layer };
}

export default async function AdminMapPage({
  searchParams,
}: {
  searchParams: Promise<MapSearchParams>;
}) {
  const params = await searchParams;
  const session = await getAdminSessionFromApi();
  const systemAdmin = session ? isSystemAdmin(session) : false;

  // Non-system-admins can't view another office's markers — the backend
  // clamps this regardless of what's requested, so their own office is
  // always what's passed here (the ?office= param is only meaningful for
  // a system admin). This is a UX convenience, not the security boundary:
  // GET /admin/tickets/geo (TicketsController.geo) re-derives office from
  // the session via resolveOfficeScope independently of whatever the
  // client sends, so a tampered ?office= can never widen the actual data.
  const office = systemAdmin
    ? params.office === "all"
      ? undefined
      : params.office === "MEO" || params.office === "MDRRMO"
        ? params.office
        : undefined
    : (session?.office ?? undefined);

  const { filters, layer } = parseMapFilters(params);

  return <MapClientLoader initialFilters={filters} initialLayer={layer} isSystemAdmin={systemAdmin} office={office} />;
}
