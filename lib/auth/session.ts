import { jwtVerify } from "jose";

// JWT (not a DB-backed session table) so middleware can verify it on the
// edge runtime with no extra database round trip per request. jose is used
// instead of jsonwebtoken because it's edge-runtime compatible.
const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export const SESSION_COOKIE = "ac_admin_session";

export interface AdminSession {
  adminId: number;
  email: string;
  adminName: string;
  office: "MEO" | "MDRRMO";
  role: "officer" | "supervisor";
}

export async function verifySession(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}
