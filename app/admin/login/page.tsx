import { redirect } from "next/navigation";
import { getAdminSessionFromApi } from "@/lib/api-client";
import AdminLoginForm from "@/components/features/admin/auth/AdminLoginForm";

export default async function AdminLoginPage() {
  const session = await getAdminSessionFromApi();
  if (session) redirect("/admin");

  return <AdminLoginForm />;
}
