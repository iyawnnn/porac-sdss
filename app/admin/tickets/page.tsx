import { sql } from "@/lib/db/raw";
import { recomputeActiveTicketUrgency } from "@/lib/triage/recompute";
import { getTicketsForAdmin, parseTicketQuery } from "@/lib/admin/tickets";
import { getAdminSession } from "@/lib/auth/getSession";
import { TicketsWorkspace } from "./TicketsWorkspace";

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const session = await getAdminSession();

  const recomputeResult = await recomputeActiveTicketUrgency();
  const filters = parseTicketQuery(query, session?.office);

  const [initialData, barangays] = await Promise.all([
    getTicketsForAdmin(filters),
    sql<{ id: number; name: string }[]>`SELECT id, name FROM barangays ORDER BY name`,
  ]);

  return (
    <TicketsWorkspace
      initialData={initialData}
      initialQuery={query}
      initialRecompute={recomputeResult}
      barangays={barangays}
      sessionOffice={session?.office}
    />
  );
}
