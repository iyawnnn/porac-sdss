import { Suspense } from "react";
import { notFound } from "next/navigation";
import { apiGetOptional, getAdminSessionFromApi } from "@/lib/api-client";
import type { BarangayProfile as BarangayProfileData } from "@/lib/types/admin-barangay-insights";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { BarangayProfile } from "@/components/features/admin/barangay-insights/BarangayProfile";
import { BarangayProfileSkeleton } from "@/components/features/admin/barangay-insights/BarangayProfileSkeleton";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

async function BarangayProfileFetch({
  barangayId,
  office,
}: {
  barangayId: number;
  office: "MEO" | "MDRRMO" | undefined;
}) {
  const session = await getAdminSessionFromApi();
  const qs = office ? `?office=${office}` : "";

  let profile: BarangayProfileData | null;
  try {
    profile = await apiGetOptional<BarangayProfileData>(`/admin/barangay-insights/${barangayId}${qs}`, [401, 404]);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="This barangay's profile couldn't load live data from the API. Try reloading this page in a moment."
        title="Barangay Profile Unavailable"
      />
    );
  }
  if (!profile) notFound();

  return <BarangayProfile isSystemAdmin={session ? isSystemAdmin(session) : false} office={office} profile={profile} />;
}

export default async function AdminBarangayInsightProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ barangayId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { barangayId: barangayIdParam } = await params;
  const query = await searchParams;
  const barangayId = Number(barangayIdParam);
  if (!Number.isInteger(barangayId) || barangayId <= 0) notFound();
  const office = query.office === "MEO" || query.office === "MDRRMO" ? query.office : undefined;

  return (
    <Suspense fallback={<BarangayProfileSkeleton />}>
      <BarangayProfileFetch barangayId={barangayId} office={office} />
    </Suspense>
  );
}
