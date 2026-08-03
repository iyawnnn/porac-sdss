import { redirect } from "next/navigation";
import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { SecurityStatus } from "@/lib/types/citizens-account";
import AccountSecurityPanel from "@/components/features/citizen/account/AccountSecurityPanel";

export default async function AccountPage() {
  const session = await getCitizenSessionFromApi();
  if (!session) redirect("/login");

  const status = await apiGet<SecurityStatus>("/citizens/account/security");

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-ink-900">
        Account &amp; Security
      </h1>
      <p className="mt-2 text-[15px] leading-[22px] text-ink-500">
        Manage your password and linked sign-in providers.
      </p>
      <AccountSecurityPanel initial={status} />
    </main>
  );
}
