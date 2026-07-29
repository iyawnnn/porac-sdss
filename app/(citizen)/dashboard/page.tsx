import { getCitizenSession } from "@/lib/auth/getCitizenSession";
import { getPublicHazardMapData } from "@/lib/citizens/publicMap";
import PublicMapClientLoader from "../map/PublicMapClientLoader";

export default async function DashboardPage() {
  const session = await getCitizenSession();
  // proxy.ts already redirects unauthenticated requests before this
  // renders; this null-check is just defense in depth.
  if (!session) return null;

  const { barangays, tickets } = await getPublicHazardMapData(session.citizenId);
  return <PublicMapClientLoader barangays={barangays} tickets={tickets} />;
}
