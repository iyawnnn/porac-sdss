import type { AdminSession } from "@/lib/auth/session";

// Frontend-only duplicate of the role checks in
// api/src/common/authz/admin-scope.ts, used purely for UI gating (hiding
// controls that would have no effect once the backend clamp applies) —
// never the source of truth for access itself. The backend guard/service
// checks are authoritative; these exist only so the UI doesn't visually
// contradict them.
export function isSystemAdmin(session: Pick<AdminSession, "role">): boolean {
  return session.role === "system_admin";
}

export function isFocal(session: Pick<AdminSession, "role">): boolean {
  return session.role === "focal";
}

// Mirrors isOperationalStaff in api/src/common/authz/admin-scope.ts — the
// only two roles with routine operational navigation/UI. Neither focal nor
// system_admin should ever be treated as operational staff on the frontend,
// even though focal also carries an office value.
export function isOperationalStaff(session: Pick<AdminSession, "role">): boolean {
  return session.role === "officer" || session.role === "supervisor";
}
