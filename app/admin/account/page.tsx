import { getAdminSessionFromApi } from "@/lib/api-client";
import { AdminAccountSecurityPanel } from "@/components/features/admin/account/AdminAccountSecurityPanel";

export default async function AdminAccountPage() {
  const session = await getAdminSessionFromApi();

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="space-y-0.5">
        <h1 className="font-heading text-base font-semibold">Account &amp; Security</h1>
        <p className="text-xs text-muted-foreground">Manage your own sign-in credentials.</p>
      </div>
      <AdminAccountSecurityPanel session={session} />
    </div>
  );
}
