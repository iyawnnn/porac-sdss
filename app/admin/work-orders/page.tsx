import { Suspense } from "react";
import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import type { PaginatedWorkOrders } from "@/lib/types/admin-work-orders";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { WorkOrdersWorkspace } from "@/components/features/admin/work-orders/WorkOrdersWorkspace";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";
import { Skeleton } from "@/components/ui/skeleton";

function WorkOrdersSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

async function WorkOrdersData({ query }: { query: Record<string, string | undefined> }) {
  const session = await getAdminSessionFromApi();
  const qs = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString();

  let initialData: PaginatedWorkOrders;
  try {
    initialData = await apiGet<PaginatedWorkOrders>(`/admin/work-orders${qs ? `?${qs}` : ""}`);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="Work orders couldn't load live data from the API — try reloading this page in a moment."
        title="Work Orders Unavailable"
      />
    );
  }

  return (
    <WorkOrdersWorkspace
      initialData={initialData}
      initialQuery={query}
      isSystemAdmin={session ? isSystemAdmin(session) : false}
      sessionOffice={session?.office ?? undefined}
    />
  );
}

export default async function AdminWorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <Suspense fallback={<WorkOrdersSkeleton />}>
      <WorkOrdersData query={query} />
    </Suspense>
  );
}
