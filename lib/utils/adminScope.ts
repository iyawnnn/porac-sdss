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

// Batch 4 (five-role production alignment): the one shared "how do we
// describe this admin's office" string — never "All Offices" for
// system_admin, since that phrasing implies operational authority the role
// no longer has (Batch 1 removed system_admin's office-wide operational
// bypass entirely; see admin-scope.ts). Used anywhere an admin's own
// office/role or another admin's office/role (e.g. an Activity Log actor)
// is displayed, so this description can't drift between surfaces.
export function officeDisplay(session: { role: string; office: string | null }): string {
  if (session.role === "system_admin") return "System Administrator / MIS";
  if (session.role === "focal") return "Central Monitoring / Focal Personnel";
  return session.office ?? "Unassigned";
}
