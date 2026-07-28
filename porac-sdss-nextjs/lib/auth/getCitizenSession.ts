import { cookies } from "next/headers";
import { verifyCitizenSession, CITIZEN_SESSION_COOKIE } from "./citizenSession";

export async function getCitizenSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CITIZEN_SESSION_COOKIE)?.value;
  return token ? verifyCitizenSession(token) : null;
}
