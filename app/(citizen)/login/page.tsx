import { redirect } from "next/navigation";
import { getCitizenSession } from "@/lib/auth/getCitizenSession";
import LoginForm from "./LoginForm";

export default async function CitizenLoginPage() {
  const session = await getCitizenSession();
  if (session) redirect("/dashboard");

  return <LoginForm />;
}
