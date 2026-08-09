import { Suspense } from "react";
import { apiGet } from "@/lib/api-client";
import type { NotificationListResponse } from "@/lib/types/admin-notifications";
import { NotificationCenterWorkspace } from "@/components/features/admin/notifications/NotificationCenterWorkspace";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";
import { Skeleton } from "@/components/ui/skeleton";

async function NotificationCenterData({ query }: { query: Record<string, string | undefined> }) {
  const status = query.status === "unread" || query.status === "read" ? query.status : "all";
  const type = query.type ?? "";
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (type) params.set("type", type);

  let initialData: NotificationListResponse;
  try {
    initialData = await apiGet<NotificationListResponse>(`/notifications${params.toString() ? `?${params.toString()}` : ""}`);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="Notifications couldn't load live data from the API. Try reloading this page in a moment."
        title="Notification Center Unavailable"
      />
    );
  }

  return <NotificationCenterWorkspace initialData={initialData} initialStatus={status} initialType={type} />;
}

function NotificationCenterSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <Suspense fallback={<NotificationCenterSkeleton />}>
      <NotificationCenterData query={query} />
    </Suspense>
  );
}
