import { redirect } from "next/navigation";
import { getCitizenSession } from "@/lib/auth/getCitizenSession";
import SignupForm from "./SignupForm";

export default async function CitizenSignupPage() {
  const session = await getCitizenSession();
  if (session) redirect("/dashboard");

  return <SignupForm />;
}
