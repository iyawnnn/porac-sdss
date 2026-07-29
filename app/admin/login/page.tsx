import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/getSession";
import AdminLoginForm from "./AdminLoginForm";

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return <AdminLoginForm />;
}
