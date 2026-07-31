import { redirect } from "next/navigation";
import { getCitizenSessionFromApi } from "@/lib/api-client";
import SignupForm from "./SignupForm";

export default async function CitizenSignupPage() {
  const session = await getCitizenSessionFromApi();
  if (session) redirect("/dashboard");

  return <SignupForm />;
}
