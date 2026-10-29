// Single source of truth for E2E demo/test credentials — imported by Playwright
// specs (e2e/*.spec.ts) AND by api/scripts/seed/seed-e2e-admins.ts (via a relative
// import across the app boundary, the same pattern api/scripts/ already uses to
// reach into root lib/, e.g. seed-diverse-reports.ts -> ../../../lib/utils/...).
// Never hardcode these emails/passwords in a spec file directly — import from here.

export interface E2EAdminAccount {
  email: string;
  password: string;
  // Appendix H staff fields (manuscript revision Phase 2, step 2e), kept
  // inside admins_account_type_office_focal_check: office is null only for
  // SYSTEM_ADMIN; Focal Personnel (PERSONNEL + isFocal) always carries office
  // "MDRRMO" — never treated as MDRRMO operational staff despite the office
  // value (see isOperationalPersonnel in api/src/common/authz/admin-scope.ts).
  accountType: "PERSONNEL" | "SYSTEM_ADMIN";
  isFocal: boolean;
  office: "MEO" | "MDRRMO" | null;
  // Only the admins.role sync mirror seed-e2e-admins.ts writes (NOT NULL
  // until Phase 8). Nothing reads it.
  role: "officer" | "supervisor" | "system_admin" | "focal";
  firstName: string;
  lastName: string;
}

// Overridable so CI/local runs can rotate the password without editing source.
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "PoracDemo2026!";

export const E2E_ADMIN_ACCOUNTS: readonly E2EAdminAccount[] = [
  { email: "meo@porac.gov.ph", password: DEMO_PASSWORD, accountType: "PERSONNEL", isFocal: false, office: "MEO", role: "supervisor", firstName: "MEO", lastName: "Supervisor" },
  { email: "mdrrmo@porac.gov.ph", password: DEMO_PASSWORD, accountType: "PERSONNEL", isFocal: false, office: "MDRRMO", role: "supervisor", firstName: "MDRRMO", lastName: "Supervisor" },
  { email: "sysadmin@porac.gov.ph", password: DEMO_PASSWORD, accountType: "SYSTEM_ADMIN", isFocal: false, office: null, role: "system_admin", firstName: "System", lastName: "Administrator" },
  { email: "focal@porac.gov.ph", password: DEMO_PASSWORD, accountType: "PERSONNEL", isFocal: true, office: "MDRRMO", role: "focal", firstName: "Focal", lastName: "Personnel" },
];

export const E2E_MEO_ADMIN = E2E_ADMIN_ACCOUNTS[0];
export const E2E_MDRRMO_ADMIN = E2E_ADMIN_ACCOUNTS[1];
export const E2E_SYSTEM_ADMIN = E2E_ADMIN_ACCOUNTS[2];
export const E2E_FOCAL_ADMIN = E2E_ADMIN_ACCOUNTS[3];

// Citizen demo accounts are already seeded idempotently by api/scripts/seed/seed-users.ts
// (ON CONFLICT upsert) — listed here only so specs share one constant instead of
// re-typing the email/password pair.
export const E2E_CITIZEN_ACCOUNT = { email: "citizen1@porac.ph", password: DEMO_PASSWORD };
// A second reporter on the same ticket (per-citizen resolution feedback,
// manuscript revision Phase 3, step 3g).
export const E2E_SECOND_CITIZEN_ACCOUNT = { email: "citizen2@porac.ph", password: DEMO_PASSWORD };
