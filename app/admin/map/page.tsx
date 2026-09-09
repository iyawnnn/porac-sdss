import { getAdminSessionFromApi } from "@/lib/api-client";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { TICKET_CATEGORIES, ALL_TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/types/admin-ticket-constants";
import MapClientLoader from "@/components/features/admin/map/MapClientLoader";
import type { MapFilterState } from "@/components/features/admin/map/MapFilterBar";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

const URGENCY_BANDS = ["Low", "Medium", "High"];
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
  const category = (ALL_TICKET_CATEGORIES as readonly string[]).includes(params.category ?? "") ? (params.category as string) : "";
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

  // Batch 6 (five-role E2E reconciliation): a real, discovered defect, not
  // a UI convenience gap. This page makes no server-side API call of its
  // own — MapClientLoader/MapClient fetch ticket data client-side — so
  // unlike every sibling operational page (Ticket Queue, Work Orders,
  // Barangay Insights, Reports), nothing here ever caught system_admin's
  // now-403'd data fetch and rendered an "Unavailable" state. Batch 1 of
  // the five-role architecture removed system_admin's operational access
  // entirely, but this page kept rendering the full map shell — including
  // a still-interactive Office picker — with only a small inline "Tickets
  // Unavailable" banner where the ticket pins would be. No data actually
  // leaked (GET /admin/tickets/geo remains guarded server-side), but the
  // page presented an operational surface to a role that must not have
  // one. Deny it the same way every sibling page does.
  if (systemAdmin) {
    return (
      <AdminErrorCard
        message="System Administrator / MIS accounts do not have operational map access."
        title="Interactive Map Unavailable"
      />
    );
  }

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
