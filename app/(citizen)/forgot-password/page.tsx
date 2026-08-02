import { redirect } from "next/navigation";
import { getCitizenSessionFromApi } from "@/lib/api-client";
import ForgotPasswordForm from "@/components/features/citizen/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const session = await getCitizenSessionFromApi();
  if (session) redirect("/dashboard");

  return <ForgotPasswordForm />;
}
