import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

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

  const email = `e2e-audit-${Date.now()}@porac.gov.ph`;
  const create = await request.post("/api/admin/admins", {
    headers,
    data: { firstName: "Audit", lastName: "Target", email, password: "longenoughpassword", role: "officer", office: "MEO" },
  });
  expect(create.status()).toBe(201);

  const log = await request.get("/api/admin/activity-log?actionType=admin_created&limit=10", { headers });
  expect(log.status()).toBe(200);
  const body = (await log.json()) as { events: Array<{ action_type: string; target_summary: string }> };
  expect(body.events.some((e) => e.action_type === "admin_created" && e.target_summary.includes(email))).toBe(true);

  await page.goto("/admin/activity-log");
  await page.getByLabel("Action type").click();
  await page.getByRole("option", { name: "Admin created" }).click();
  await expect(page.getByText(email).first()).toBeVisible();
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
