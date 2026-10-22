import assert from "node:assert/strict";
import test from "node:test";
import { accountLabel, actorDescription, isFocalPersonnel, isOperationalPersonnel, isSystemAdmin, staffDescription } from "./adminScope";

// Manuscript revision Phase 2, step 2e: the UI gates moved from role to
// accountType / isFocal / office and must decide exactly as before. Each
// role x office combination that exists today is mapped with migration
// 0039's mapping and compared with the old role-based checks, copied here
// as the reference. api/src/common/authz/access-parity.spec.ts does the
// same for the API.

type OldRole = "officer" | "supervisor" | "focal" | "system_admin";
type Office = "MEO" | "MDRRMO";

const old = {
  isSystemAdmin: (role: OldRole) => role === "system_admin",
  isFocal: (role: OldRole) => role === "focal",
  isOperationalStaff: (role: OldRole) => role === "officer" || role === "supervisor",
};

function mapped(role: OldRole, office: Office | null) {
  return {
    accountType: role === "system_admin" ? ("SYSTEM_ADMIN" as const) : ("PERSONNEL" as const),
    isFocal: role === "focal",
    office: role === "focal" ? ("MDRRMO" as const) : office,
  };
}

const COMBINATIONS: [OldRole, Office | null][] = [
  ["officer", "MEO"],
  ["officer", "MDRRMO"],
  ["supervisor", "MEO"],
  ["supervisor", "MDRRMO"],
  ["focal", "MDRRMO"],
  ["focal", null],
  ["system_admin", null],
];

test("every UI gate decides as the old role checks did", () => {
  for (const [role, office] of COMBINATIONS) {
    const account = mapped(role, office);
    assert.equal(isSystemAdmin(account), old.isSystemAdmin(role), `isSystemAdmin for ${role} ${office}`);
    assert.equal(isFocalPersonnel(account), old.isFocal(role), `isFocalPersonnel for ${role} ${office}`);
    assert.equal(isOperationalPersonnel(account), old.isOperationalStaff(role), `isOperationalPersonnel for ${role} ${office}`);
  }
});

test("officer and supervisor read the same: Personnel, with the office", () => {
  assert.equal(staffDescription(mapped("officer", "MEO")), "MEO · Personnel");
  assert.equal(staffDescription(mapped("supervisor", "MEO")), "MEO · Personnel");
  assert.equal(staffDescription(mapped("supervisor", "MDRRMO")), "MDRRMO · Personnel");
  assert.equal(accountLabel(mapped("officer", "MEO")), "Personnel");
  assert.equal(accountLabel(mapped("supervisor", "MDRRMO")), "Personnel");
});

test("Focal Personnel and the System Administrator read by label alone", () => {
  assert.equal(accountLabel(mapped("focal", "MDRRMO")), "Focal Personnel");
  assert.equal(staffDescription(mapped("focal", "MDRRMO")), "Focal Personnel");
  assert.equal(accountLabel(mapped("system_admin", null)), "System Administrator");
  assert.equal(staffDescription(mapped("system_admin", null)), "System Administrator");
});

test("audit actors display through the same labels, mapped from the stored actor_role", () => {
  assert.equal(actorDescription("officer", "MEO"), "MEO · Personnel");
  assert.equal(actorDescription("supervisor", "MDRRMO"), "MDRRMO · Personnel");
  assert.equal(actorDescription("focal", "MDRRMO"), "Focal Personnel");
  assert.equal(actorDescription("system_admin", null), "System Administrator");
});

test("no label says Supervisor or Officer anymore", () => {
  const labels = [
    ...COMBINATIONS.map(([role, office]) => staffDescription(mapped(role, office))),
    ...COMBINATIONS.map(([role, office]) => actorDescription(role, office)),
  ];
  for (const label of labels) assert.doesNotMatch(label, /supervisor|officer/i);
});
