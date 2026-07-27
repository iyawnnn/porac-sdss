import { getAdminSession } from "@/lib/auth/getSession";
import MapClientLoader from "./MapClientLoader";

export default async function AdminMapPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string }>;
}) {
  const params = await searchParams;
  const session = await getAdminSession();

  // Same default-to-own-office rule as the ticket list — see that page.
  const office =
    params.office === "all"
      ? undefined
      : params.office === "CEO" || params.office === "ACDRRMO"
        ? params.office
        : session?.office;

  return <MapClientLoader office={office} />;
}
