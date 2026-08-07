import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { PublicTicketGeoRow, BarangayGeoFeatureCollection } from "@/lib/types/citizens-public-map";
import PublicMapClientLoader from "@/components/features/citizen/map/PublicMapClientLoader";
import { CitizenUnauthorized } from "@/components/features/citizen/dashboard/CitizenUnauthorized";

export default async function CitizenPublicMapPage() {
  const session = await getCitizenSessionFromApi();
  // proxy.ts already redirects unauthenticated requests before this
  // renders; this is just defense in depth.
  if (!session) return <CitizenUnauthorized />;

  const { barangays, tickets } = await apiGet<{
    barangays: BarangayGeoFeatureCollection;
    tickets: PublicTicketGeoRow[];
  }>("/public-map");
  return <PublicMapClientLoader barangays={barangays} tickets={tickets} />;
}
