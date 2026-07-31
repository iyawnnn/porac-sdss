import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { PublicTicketGeoRow, BarangayGeoFeatureCollection } from "@/lib/citizens/publicMap";
import PublicMapClientLoader from "./PublicMapClientLoader";

export default async function CitizenPublicMapPage() {
  const session = await getCitizenSessionFromApi();
  // proxy.ts already redirects unauthenticated requests before this
  // renders; this null-check is just defense in depth.
  if (!session) return null;

  const { barangays, tickets } = await apiGet<{
    barangays: BarangayGeoFeatureCollection;
    tickets: PublicTicketGeoRow[];
  }>("/public-map");
  return <PublicMapClientLoader barangays={barangays} tickets={tickets} />;
}
