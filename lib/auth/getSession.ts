import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "./session";

// Server Component / Route Handler helper — reads the session cookie via
// next/headers. Route handlers that already have a NextRequest can read
// req.cookies directly instead (see app/api/admin/tickets/[id]/status).
export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}
