import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs, settleAdminPage } from "./helpers";

import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } from "../lib/types/admin-audit";
import type { PaginatedAdminAudit } from "../lib/types/admin-audit";
const fixture = process.env.E2E_GROUPING_FIXTURES
  ? (JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { auditView: { targetId: number; actorId: number } }).auditView : null;
test.setTimeout(90_000);

function authHeaders(cookies: { name: string; value: string }[]): Record<string, string> {
  const sessionCookie = cookies.find((c) => c.name === "ac_admin_session");
  return sessionCookie ? { cookie: `${sessionCookie.name}=${sessionCookie.value}` } : {};
}

test("system admin sees the Activity Log link and can open the page", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const nav = page.getByRole("navigation", { name: "Admin" });
  const link = nav.getByRole("link", { name: "Activity Log" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/activity-log$/);
  await expect(page.getByRole("heading", { name: "Activity Log" })).toBeVisible();
});

for (const [name, account] of [["MEO", E2E_MEO_ADMIN], ["MDRRMO", E2E_MDRRMO_ADMIN]] as const) {
  test(`${name} office admin does not see the Activity Log link`, async ({ page }) => {
    await loginAs(page, account);
    const nav = page.getByRole("navigation", { name: "Admin" });
    await expect(nav.getByRole("link", { name: "Activity Log" })).toHaveCount(0);
  });

  test(`${name} office admin gets forbidden behavior visiting /admin/activity-log directly`, async ({ page }) => {
    await loginAs(page, account);
    await page.goto("/admin/activity-log");
    await expect(page.getByRole("heading", { name: "Activity Log" })).toHaveCount(0);
    await expect(page.getByText(/this page could not be found/i)).toBeVisible();
  });

  test(`${name} office admin's API calls to the activity log endpoint are rejected server-side`, async ({ page, request }) => {
    await loginAs(page, account);
    const cookies = await page.context().cookies();
    const list = await request.get("/api/admin/activity-log", { headers: authHeaders(cookies) });
    expect(list.status()).toBe(403);
  });
}

test("creating an admin account writes an audit event that a system admin can see in the Activity Log", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const headers = { ...authHeaders(cookies), "content-type": "application/json" };

  const stamp = Date.now();
  const email = `e2e-audit-${stamp}@porac.gov.ph`;
  const firstName = `Audit${stamp}`;
  const create = await request.post("/api/admin/admins", {
    headers,
    data: { firstName, lastName: "Target", email, password: "longenoughpassword", accountType: "PERSONNEL", isFocal: false, office: "MEO" },
  });
  expect(create.status()).toBe(201);

  const created = await create.json() as { id: number };
  const edit = await request.patch(`/api/admin/admins/${created.id}`, {
    headers, data: { accountType: "PERSONNEL", isFocal: false, office: "MDRRMO" },
  });
  expect(edit.ok()).toBe(true);
  const staff = await (await request.get("/api/admin/admins", { headers })).json() as { id: number; email: string; first_name: string; last_name: string }[];
  const actor = staff.find(a => a.email === E2E_SYSTEM_ADMIN.email)!;
  const params = new URLSearchParams({ actionType: "admin_role_updated", targetType: "admin", targetId: String(created.id), actorAdminId: String(actor.id) });
  const log = await request.get(`/api/admin/activity-log?${params}`, { headers });
  expect(log.status()).toBe(200);
  const body = await log.json() as PaginatedAdminAudit;
  expect(body.total).toBe(1);
  expect(body.events[0].details).toMatchObject({ from_office: "MEO", to_office: "MDRRMO", sessionsEnded: true });
  expect(body.events[0].target_label).toBe(firstName + " Target");
  expect(JSON.stringify(body)).not.toContain(email);
  expect(JSON.stringify(body)).not.toContain("reason");
  await page.goto("/admin/activity-log?targetType=admin");
  await settleAdminPage(page, page.getByRole("heading", { name: "Activity Log", exact: true }));
  await page.getByLabel("Target id", { exact: true }).fill(String(created.id));
  await page.getByLabel("Actor", { exact: true }).click();
  await page.getByRole("option", { name: actor.first_name + " " + actor.last_name + " (#" + actor.id + ")", exact: true }).click();
  await page.getByLabel("Action type").click();
  await page.getByRole("option", { name: AUDIT_ACTION_LABELS.admin_role_updated, exact: true }).click();
  const table = page.getByRole("table");
  await expect(table.getByText(firstName + " Target", { exact: true })).toBeVisible();
  await expect(table.getByText(/Office: MEO → MDRRMO/)).toBeVisible();
  await expect(table.getByText(email)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp("actorAdminId=" + actor.id));
  await expect(page).toHaveURL(new RegExp("targetId=" + created.id));
});

test("system admin can filter the activity log by target type and reset filters", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/activity-log");

  await page.getByLabel("Target type").click();
  await page.getByRole("option", { name: "Admin" }).click();
  await expect(page).toHaveURL(/targetType=admin/);
  await expect(page.getByRole("button", { name: "Reset filters" })).toBeVisible();

  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page).not.toHaveURL(/targetType=admin/);
});


test("all actions have filter labels and previously blank events show badges without private text", async ({ page }) => {
  expect(fixture, "global setup audit fixtures").toBeTruthy();
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto(`/admin/activity-log?targetType=ticket&targetId=${fixture!.targetId}&limit=100`);
  await settleAdminPage(page, page.getByRole("heading", { name: "Activity Log", exact: true }));
  await page.getByLabel("Action type").click();
  for (const action of AUDIT_ACTIONS) await expect(page.getByRole("option", { name: AUDIT_ACTION_LABELS[action], exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  for (const action of ["admin_deactivated", "admin_reactivated", "admin_login", "admin_login_failed", "report_acknowledged", "report_screened", "report_escalated", "operational_assessment_created", "operational_assessment_updated"] as const) {
    await page.getByLabel("Action type").click();
    await page.getByRole("option", { name: AUDIT_ACTION_LABELS[action], exact: true }).click();
    await expect(page.getByRole("table").getByText(AUDIT_ACTION_LABELS[action], { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(/E2E PRIVATE|private@example.test/)).toHaveCount(0);
});

test("Manila date and actor/target filters isolate this run while prior audit rows accumulate", async ({ page, request }) => {
  expect(fixture).toBeTruthy();
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const headers = authHeaders(await page.context().cookies());
  const params = new URLSearchParams({ targetType: "ticket", targetId: String(fixture!.targetId), actorAdminId: String(fixture!.actorId), from: "2026-11-05", to: "2026-11-05", limit: "100" });
  const first = await (await request.get(`/api/admin/activity-log?${params}`, { headers })).json() as PaginatedAdminAudit;
  expect(first.total).toBe(30);
  expect(first.events.every(e => e.created_at === "2026-11-05T15:59:00.000Z" && e.target_id === fixture!.targetId && e.actor.id === fixture!.actorId)).toBe(true);
  await page.goto(`/admin/activity-log?${params}`);
  await settleAdminPage(page, page.getByRole("heading", { name: "Activity Log", exact: true }));
  await expect(page.getByText("Dates: Asia/Manila")).toBeVisible();
  await expect(page.getByText("Showing 1–30 of 30 events")).toBeVisible();
  // Clear the upper day first, avoiding a transient reversed date range.
  await page.getByLabel("To date").fill("");
  await page.getByLabel("From date").fill("2026-11-06");
  await page.getByLabel("To date").fill("2026-11-06");
  await expect(page.getByText("Showing 1–1 of 1 events")).toBeVisible();
  params.set("from", "2026-11-06"); params.set("to", "2026-11-06");
  const next = await (await request.get(`/api/admin/activity-log?${params}`, { headers })).json() as PaginatedAdminAudit;
  expect(next.total).toBe(1);
  expect(next.events[0].created_at).toBe("2026-11-05T16:00:00.000Z");
});
