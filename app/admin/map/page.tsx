import { getAdminSessionFromApi } from "@/lib/api-client";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import MapClientLoader from "@/components/features/admin/map/MapClientLoader";

export default async function AdminMapPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string }>;
}) {
  const params = await searchParams;
  const session = await getAdminSessionFromApi();
  const systemAdmin = session ? isSystemAdmin(session) : false;

  // Non-system-admins can't view another office's markers — the backend
  // clamps this regardless of what's requested, so their own office is
  // always what's passed here (the ?office= param is only meaningful for
  // a system admin).
  const office = systemAdmin
    ? params.office === "all"
      ? undefined
      : params.office === "MEO" || params.office === "MDRRMO"
        ? params.office
        : undefined
    : (session?.office ?? undefined);

  return <MapClientLoader isSystemAdmin={systemAdmin} office={office} />;
}
