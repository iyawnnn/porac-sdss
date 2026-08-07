import type { AdminSession } from "@/lib/auth/session";

// Frontend-only duplicate of the role check in
// api/src/common/authz/admin-scope.ts, used purely for UI gating (hiding
// controls that would have no effect once the backend clamp applies) —
// never the source of truth for access itself.
export function isSystemAdmin(session: Pick<AdminSession, "role">): boolean {
  return session.role === "system_admin";
}
