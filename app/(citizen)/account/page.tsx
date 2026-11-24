import { redirect } from "next/navigation";
import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { SecurityStatus } from "@/lib/types/citizens-account";
import AccountSecurityPanel, { SettingsSection } from "@/components/features/citizen/account/AccountSecurityPanel";
import { Text } from "@/components/ui/text";

export default async function AccountPage() {
  const session = await getCitizenSessionFromApi();
  if (!session) redirect("/login");

  const status = await apiGet<SecurityStatus>("/citizens/account/security");

  return (
    <main className="mx-auto flex max-w-4xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Text as="h1" variant="heading">Account &amp; Security</Text>
      <Text variant="body-sm" color="muted" className="mt-1">Your profile, password and sign-in methods.</Text>

      <div className="mt-2">
        {/* Read-only: the API has no profile-editing route, so nothing here pretends to be editable. */}
        <SettingsSection title="Profile" description="The name and email on your PORAC-SDSS account.">
          <dl className="flex max-w-md flex-col divide-y divide-border rounded-lg border border-border">
            <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="text-sm font-medium [overflow-wrap:anywhere]">{session.citizenName}</dd>
            </div>
            <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd className="text-sm font-medium [overflow-wrap:anywhere]">{session.email}</dd>
            </div>
          </dl>
        </SettingsSection>
        <AccountSecurityPanel initial={status} />
      </div>
    </main>
  );
}
