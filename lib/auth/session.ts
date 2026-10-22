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
  // Appendix H staff fields (manuscript revision Phase 2, step 2e) — what
  // every UI gate reads (lib/utils/adminScope.ts). office is null only for
  // "SYSTEM_ADMIN"; Focal Personnel (PERSONNEL + isFocal) is always
  // "MDRRMO"; every other account is pinned to exactly one office. No role:
  // the API session doesn't carry one.
  accountType: "PERSONNEL" | "SYSTEM_ADMIN";
  isFocal: boolean;
  office: "MEO" | "MDRRMO" | null;
}

export async function verifySession(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: "admin" });
    // A token signed before Phase 2, step 2e (a role, no accountType) is no
    // session at all, as in the API's verifyAdminSession — the page
    // redirects to /admin/login instead of rendering half a session.
    if ((payload.accountType !== "PERSONNEL" && payload.accountType !== "SYSTEM_ADMIN") || typeof payload.isFocal !== "boolean") {
      return null;
    }
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}
