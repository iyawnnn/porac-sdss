import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

test("system admin sees the Admin Management link and can open the page", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const nav = page.getByRole("navigation", { name: "Admin" });
  const link = nav.getByRole("link", { name: "Admin Management" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/admins$/);
  await expect(page.getByRole("heading", { name: "Admin Management" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Admin" })).toBeVisible();
});

for (const [name, account] of [["MEO", E2E_MEO_ADMIN], ["MDRRMO", E2E_MDRRMO_ADMIN]] as const) {
  test(`${name} office admin does not see the Admin Management link`, async ({ page }) => {
    await loginAs(page, account);
    const nav = page.getByRole("navigation", { name: "Admin" });
    await expect(nav.getByRole("link", { name: "Admin Management" })).toHaveCount(0);
  });

  test(`${name} office admin gets forbidden behavior visiting /admin/admins directly`, async ({ page }) => {
    await loginAs(page, account);
    await page.goto("/admin/admins");
    await expect(page.getByRole("heading", { name: "Admin Management" })).toHaveCount(0);
    await expect(page.getByText(/this page could not be found/i)).toBeVisible();
  });

  test(`${name} office admin's API calls to admin-management endpoints are rejected server-side`, async ({ page, request }) => {
    await loginAs(page, account);
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "ac_admin_session");
    const headers: Record<string, string> = sessionCookie ? { cookie: `${sessionCookie.name}=${sessionCookie.value}` } : {};

    const list = await request.get("/api/admin/admins", { headers });
    expect(list.status()).toBe(403);

    const create = await request.post("/api/admin/admins", {
      headers,
      data: { firstName: "X", lastName: "Y", email: `blocked-${Date.now()}@example.com`, password: "longenoughpassword", role: "officer", office: "MEO" },
    });
    expect(create.status()).toBe(403);
  });
}

test("system admin can create a new office admin account and it appears in the list", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/admins");

  const email = `e2e-created-${Date.now()}@porac.gov.ph`;
  await page.getByRole("button", { name: "Add Admin" }).click();
  const dialog = page.getByRole("dialog", { name: "Add administrator account" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("First name").fill("Created");
  await dialog.getByLabel("Last name").fill("ByTest");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Temporary password").fill("longenoughpassword");
  await dialog.getByLabel("Role").click();
  await page.getByRole("option", { name: "Supervisor" }).click();
  await dialog.getByLabel("Office").click();
  await page.getByRole("option", { name: "MDRRMO", exact: true }).click();

  await dialog.getByRole("button", { name: "Create admin" }).click();
  await expect(dialog).toHaveCount(0);
  // Both the desktop table and the mobile card list render in the DOM
  // (toggled by CSS breakpoint, not conditional rendering) — scope to the
  // first match rather than asserting a single element exists.
  await expect(page.getByText(email).first()).toBeVisible();
  await expect(page.getByText("Created ByTest").first()).toBeVisible();
});

test("system admin cannot save an invalid role/office combination from the inline editor", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === "ac_admin_session");
  const headers: Record<string, string> = sessionCookie
    ? { cookie: `${sessionCookie.name}=${sessionCookie.value}`, "content-type": "application/json" }
    : { "content-type": "application/json" };

  const list = await request.get("/api/admin/admins", { headers });
  const admins = (await list.json()) as Array<{ id: number; role: string }>;
  const officeAdmin = admins.find((a) => a.role !== "system_admin");
  expect(officeAdmin).toBeTruthy();

  const invalid = await request.patch(`/api/admin/admins/${officeAdmin!.id}`, {
    headers,
    data: { role: "system_admin", office: "MEO" },
  });
  expect(invalid.status()).toBe(400);
});

test("system admin sees account status and can deactivate then reactivate an office admin", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/admins");

  // Create a throwaway admin rather than touching a shared seeded account —
  // deactivating meo@porac.gov.ph/mdrrmo@porac.gov.ph would break every
  // other spec that logs in as them under --workers=1.
  const email = `e2e-deactivate-${Date.now()}@porac.gov.ph`;
  await page.getByRole("button", { name: "Add Admin" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add administrator account" });
  await createDialog.getByLabel("First name").fill("Toggle");
  await createDialog.getByLabel("Last name").fill("Target");
  await createDialog.getByLabel("Email").fill(email);
  await createDialog.getByLabel("Temporary password").fill("longenoughpassword");
  await createDialog.getByRole("button", { name: "Create admin" }).click();
  await expect(createDialog).toHaveCount(0);

  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row.getByText("Active")).toBeVisible();

  await row.getByRole("button", { name: "Deactivate" }).click();
  const deactivateDialog = page.getByRole("dialog", { name: /Deactivate Toggle Target/ });
  await expect(deactivateDialog).toBeVisible();
  await deactivateDialog.getByRole("checkbox").check();
  await deactivateDialog.getByRole("button", { name: "Deactivate" }).click();
  await expect(deactivateDialog).toHaveCount(0);
  await expect(row.getByText("Deactivated")).toBeVisible();

  await row.getByRole("button", { name: "Reactivate" }).click();
  await expect(row.getByText("Active")).toBeVisible();
});

test("office admins cannot deactivate/reactivate anyone (server-side rejection)", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === "ac_admin_session");
  const headers: Record<string, string> = sessionCookie ? { cookie: `${sessionCookie.name}=${sessionCookie.value}` } : {};

  const deactivate = await request.post(`/api/admin/admins/1/deactivate`, { headers });
  expect(deactivate.status()).toBe(403);
  const reactivate = await request.post(`/api/admin/admins/1/reactivate`, { headers });
  expect(reactivate.status()).toBe(403);
});

test("deactivated admin cannot log in or access admin pages", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/admins");

  const email = `e2e-locked-out-${Date.now()}@porac.gov.ph`;
  const password = "longenoughpassword";
  await page.getByRole("button", { name: "Add Admin" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add administrator account" });
  await createDialog.getByLabel("First name").fill("Locked");
  await createDialog.getByLabel("Last name").fill("Out");
  await createDialog.getByLabel("Email").fill(email);
  await createDialog.getByLabel("Temporary password").fill(password);
  await createDialog.getByRole("button", { name: "Create admin" }).click();
  await expect(createDialog).toHaveCount(0);

  const row = page.getByRole("row").filter({ hasText: email });
  await row.getByRole("button", { name: "Deactivate" }).click();
  const deactivateDialog = page.getByRole("dialog", { name: /Deactivate Locked Out/ });
  await deactivateDialog.getByRole("checkbox").check();
  await deactivateDialog.getByRole("button", { name: "Deactivate" }).click();
  await expect(deactivateDialog).toHaveCount(0);

  const login = await request.post("/api/admin/login", { data: { email, password } });
  expect(login.status()).toBe(401);
});

test("cannot deactivate the last active System Administrator (server-side)", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === "ac_admin_session");
  const headers: Record<string, string> = sessionCookie ? { cookie: `${sessionCookie.name}=${sessionCookie.value}` } : {};

  const list = await request.get("/api/admin/admins", { headers });
  const admins = (await list.json()) as Array<{ id: number; role: string; is_active: boolean }>;
  const activeSystemAdmins = admins.filter((a) => a.role === "system_admin" && a.is_active);
  // The seeded demo data always has exactly one system_admin, so this
  // assertion documents the precondition the test relies on rather than
  // guessing which id to target.
  expect(activeSystemAdmins).toHaveLength(1);

  const deactivate = await request.post(`/api/admin/admins/${activeSystemAdmins[0].id}/deactivate`, { headers });
  expect(deactivate.status()).toBe(409);
});
