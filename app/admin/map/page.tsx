import { getAdminSessionFromApi } from "@/lib/api-client";
import MapClientLoader from "@/components/features/admin/map/MapClientLoader";

export default async function AdminMapPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string }>;
}) {
  const params = await searchParams;
  const session = await getAdminSessionFromApi();

  // Same default-to-own-office rule as the ticket list — see that page.
  const office =
    params.office === "all"
      ? undefined
      : params.office === "MEO" || params.office === "MDRRMO"
        ? params.office
        : session?.office;

  return <MapClientLoader office={office} />;
}
