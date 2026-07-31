import { redirect } from "next/navigation";
import { getCitizenSessionFromApi } from "@/lib/api-client";
import LoginForm from "./LoginForm";

export default async function CitizenLoginPage() {
  const session = await getCitizenSessionFromApi();
  if (session) redirect("/dashboard");

  return <LoginForm />;
}
