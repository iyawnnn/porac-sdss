import { getPublicHazardMapData } from "@/lib/citizens/publicMap";
import PublicMapClientLoader from "./PublicMapClientLoader";

export default async function CitizenPublicMapPage() {
  const { barangays, tickets } = await getPublicHazardMapData();
  return <PublicMapClientLoader barangays={barangays} tickets={tickets} />;
}
