import { redirect } from "next/navigation";
import { getCitizenSessionFromApi } from "@/lib/api-client";
import LoginForm from "@/components/features/citizen/auth/LoginForm";

export default async function CitizenLoginPage() {
  const session = await getCitizenSessionFromApi();
  if (session) redirect("/dashboard");

  return <LoginForm />;
}
