// Single source of truth for E2E demo/test credentials — imported by Playwright
// specs (e2e/*.spec.ts) AND by api/scripts/seed/seed-e2e-admins.ts (via a relative
// import across the app boundary, the same pattern api/scripts/ already uses to
// reach into root lib/, e.g. seed-diverse-reports.ts -> ../../../lib/utils/...).
// Never hardcode these emails/passwords in a spec file directly — import from here.

export interface E2EAdminAccount {
  email: string;
  password: string;
  // null only for role: "system_admin" — see api/src/common/authz/admin-scope.ts.
  office: "MEO" | "MDRRMO" | null;
  role: "officer" | "supervisor" | "system_admin";
  firstName: string;
  lastName: string;
}

// Overridable so CI/local runs can rotate the password without editing source.
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "PoracDemo2026!";

export const E2E_ADMIN_ACCOUNTS: readonly E2EAdminAccount[] = [
  { email: "meo@porac.gov.ph", password: DEMO_PASSWORD, office: "MEO", role: "supervisor", firstName: "MEO", lastName: "Supervisor" },
  { email: "mdrrmo@porac.gov.ph", password: DEMO_PASSWORD, office: "MDRRMO", role: "supervisor", firstName: "MDRRMO", lastName: "Supervisor" },
  { email: "sysadmin@porac.gov.ph", password: DEMO_PASSWORD, office: null, role: "system_admin", firstName: "System", lastName: "Administrator" },
];

export const E2E_MEO_ADMIN = E2E_ADMIN_ACCOUNTS[0];
export const E2E_MDRRMO_ADMIN = E2E_ADMIN_ACCOUNTS[1];
export const E2E_SYSTEM_ADMIN = E2E_ADMIN_ACCOUNTS[2];

// Citizen demo accounts are already seeded idempotently by api/scripts/seed/seed-users.ts
// (ON CONFLICT upsert) — listed here only so specs share one constant instead of
// re-typing the email/password pair.
export const E2E_CITIZEN_ACCOUNT = { email: "citizen1@porac.ph", password: DEMO_PASSWORD };
