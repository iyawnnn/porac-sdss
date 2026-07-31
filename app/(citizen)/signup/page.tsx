import { redirect } from "next/navigation";
import { getCitizenSessionFromApi } from "@/lib/api-client";
import SignupForm from "@/components/features/citizen/auth/SignupForm";

export default async function CitizenSignupPage() {
  const session = await getCitizenSessionFromApi();
  if (session) redirect("/dashboard");

  return <SignupForm />;
}
