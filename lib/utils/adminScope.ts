import type { AdminSession } from "@/lib/auth/session";

// Frontend-only duplicate of the checks in
// api/src/common/authz/admin-scope.ts (same names), used purely for UI
// gating (hiding controls that would have no effect once the backend clamp
// applies) — never the source of truth for access itself. The backend
// guard/service checks are authoritative; these exist only so the UI
// doesn't visually contradict them. Since manuscript revision Phase 2,
// step 2e they read accountType / isFocal / office, never a role.
export function isSystemAdmin(session: Pick<AdminSession, "accountType">): boolean {
  return session.accountType === "SYSTEM_ADMIN";
}

export function isFocalPersonnel(session: Pick<AdminSession, "accountType" | "isFocal">): boolean {
  return session.accountType === "PERSONNEL" && session.isFocal === true;
}

// Mirrors isOperationalPersonnel in api/src/common/authz/admin-scope.ts —
// the only accounts with routine operational navigation/UI. Neither Focal
// Personnel nor the System Administrator is ever treated as operational on
// the frontend, even though Focal also carries an office value.
export function isOperationalPersonnel(session: Pick<AdminSession, "accountType" | "isFocal">): boolean {
  return session.accountType === "PERSONNEL" && session.isFocal === false;
}

// The three staff labels (Phase 2, step 2e). The full staff form with
// separate fields arrives in Phase 7.
export function accountLabel(account: Pick<AdminSession, "accountType" | "isFocal">): string {
  if (isSystemAdmin(account)) return "System Administrator";
  if (isFocalPersonnel(account)) return "Focal Personnel";
  return "Personnel";
}

// Batch 4 (five-role production alignment): the one shared "how do we
// describe this admin" string, wherever an admin's own account or another
// admin's is displayed, so it can't drift between surfaces. Operational
// Personnel show their office ("MEO · Personnel"); Focal Personnel and the
// System Administrator show their label alone — never "All Offices" for the
// System Administrator, since that phrasing implies operational authority it
// no longer has (Batch 1; see admin-scope.ts).
export function staffDescription(account: Pick<AdminSession, "accountType" | "isFocal" | "office">): string {
  return isOperationalPersonnel(account) ? `${account.office ?? "Unassigned"} \u00b7 Personnel` : accountLabel(account);
}

// Activity Log actors. An audit event keeps the role it was written with
// (actor_role, history — never rewritten), so every event, old or new,
// displays through the same three labels mapped from it: officer and
// supervisor (identical permissions) -> Personnel, focal -> Focal
// Personnel, system_admin -> System Administrator.
export function actorDescription(actorRole: string, actorOffice: string | null): string {
  if (actorRole === "officer" || actorRole === "supervisor") return `${actorOffice ?? "Unassigned"} \u00b7 Personnel`;
  if (actorRole === "focal") return "Focal Personnel";
  return "System Administrator";
}
