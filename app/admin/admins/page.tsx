import { Suspense } from "react";
import { notFound } from "next/navigation";
import { apiGetOptional } from "@/lib/api-client";
import type { AdminAccountRow } from "@/lib/types/admin-admins";
import { AdminManagementWorkspace } from "@/components/features/admin/admins/AdminManagementWorkspace";
import { AdminManagementSkeleton } from "@/components/features/admin/admins/AdminManagementSkeleton";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

async function AdminManagementData() {
  let admins: AdminAccountRow[] | null;
  try {
    // SystemAdminGuard rejects office-scoped admins with 403 — treated the
    // same as a missing page (notFound) rather than surfaced as an error,
    // since there is no lesser view for MEO/MDRRMO to fall back to here.
    admins = await apiGetOptional<AdminAccountRow[]>("/admin/admins", [401, 403]);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="Admin Management couldn't load live data from the API. Try reloading this page in a moment."
        title="Admin Management Unavailable"
      />
    );
  }
  if (!admins) notFound();
  return <AdminManagementWorkspace initialAdmins={admins} />;
}

export default function AdminAdminsPage() {
  return (
    <Suspense fallback={<AdminManagementSkeleton />}>
      <AdminManagementData />
    </Suspense>
  );
}
