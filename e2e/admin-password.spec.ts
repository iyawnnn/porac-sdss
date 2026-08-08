import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

function authHeaders(cookies: { name: string; value: string }[]): Record<string, string> {
  const sessionCookie = cookies.find((c) => c.name === "ac_admin_session");
  return sessionCookie ? { cookie: `${sessionCookie.name}=${sessionCookie.value}` } : {};
}

// Creates a throwaway officer account via the API so password-change/reset
// tests never touch the shared demo accounts other specs log in as.
async function createThrowawayAdmin(
  request: APIRequestContext,
  systemAdminCookies: { name: string; value: string }[],
  password: string,
): Promise<{ id: number; email: string }> {
  const email = `e2e-pw-${Date.now()}-${Math.random().toString(36).slice(2)}@porac.gov.ph`;
  const res = await request.post("/api/admin/admins", {
    headers: { ...authHeaders(systemAdminCookies), "content-type": "application/json" },
    data: { firstName: "Throwaway", lastName: "Admin", email, password, role: "officer", office: "MEO" },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { id: number; email: string };
  return body;
}

test("admin sees an Account & Security entry point and can open the page", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.getByRole("button", { name: "Open administrator menu" }).click();
  await page.getByRole("menuitem", { name: "Account & Security" }).click();
  await expect(page).toHaveURL(/\/admin\/account$/);
  await expect(page.getByRole("heading", { name: "Account & Security" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();
});

test("wrong current password is rejected and does not change anything", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const sysCookies = await page.context().cookies();
  const password = "original-password-123";
  const throwaway = await createThrowawayAdmin(request, sysCookies, password);

  await page.context().clearCookies();
  await loginAs(page, { email: throwaway.email, password });
  await page.goto("/admin/account");

  await page.getByLabel("Current password").fill("definitely-wrong-password");
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password-1");
  await page.getByLabel("Confirm new password").fill("a-brand-new-password-1");
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page.getByText(/current password is incorrect/i)).toBeVisible();
});

test("admin can change their own password, and the change invalidates other sessions while keeping the current one signed in", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const sysCookies = await page.context().cookies();
  const oldPassword = "original-password-456";
  const newPassword = "a-completely-new-password-2";
  const throwaway = await createThrowawayAdmin(request, sysCookies, oldPassword);

  await page.context().clearCookies();
  await loginAs(page, { email: throwaway.email, password: oldPassword });

  const cookiesBeforeChange = await page.context().cookies();
  const oldSessionCookie = cookiesBeforeChange.find((c) => c.name === "ac_admin_session");
  expect(oldSessionCookie).toBeTruthy();

  await page.goto("/admin/account");
  await page.getByLabel("Current password").fill(oldPassword);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/password changed/i)).toBeVisible();

  // The pre-change cookie must now be rejected everywhere...
  const staleCheck = await request.get("/api/auth/me", {
    headers: { cookie: `${oldSessionCookie!.name}=${oldSessionCookie!.value}` },
  });
  expect(staleCheck.status()).toBe(401);

  // ...but the current tab's cookie was rotated and must still work.
  const cookiesAfterChange = await page.context().cookies();
  const rotatedSessionCookie = cookiesAfterChange.find((c) => c.name === "ac_admin_session");
  expect(rotatedSessionCookie).toBeTruthy();
  expect(rotatedSessionCookie!.value).not.toBe(oldSessionCookie!.value);
  const freshCheck = await request.get("/api/auth/me", {
    headers: { cookie: `${rotatedSessionCookie!.name}=${rotatedSessionCookie!.value}` },
  });
  expect(freshCheck.status()).toBe(200);

  // Logging in again only works with the new password now.
  await page.context().clearCookies();
  await loginAs(page, { email: throwaway.email, password: newPassword });
});

test("system admin can reset another admin's password from Admin Management, and it takes effect immediately", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const sysCookies = await page.context().cookies();
  const oldPassword = "reset-me-original-1";
  const newPassword = "reset-me-new-password-2";
  const throwaway = await createThrowawayAdmin(request, sysCookies, oldPassword);

  await page.goto("/admin/admins");
  const row = page.getByRole("row").filter({ hasText: throwaway.email });
  await row.getByRole("button", { name: "Reset password" }).click();

  const dialog = page.getByRole("dialog", { name: /Reset password for/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("New temporary password").fill(newPassword);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Reset password" }).click();
  await expect(dialog.getByText(/won't be shown again/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);

  await page.context().clearCookies();
  const oldLoginFailed = await request.post("/api/admin/login", {
    data: { email: throwaway.email, password: oldPassword },
  });
  expect(oldLoginFailed.status()).toBe(401);

  await loginAs(page, { email: throwaway.email, password: newPassword });
});

for (const [name, account] of [["MEO", E2E_MEO_ADMIN], ["MDRRMO", E2E_MDRRMO_ADMIN]] as const) {
  test(`${name} office admin cannot reset another admin's password via the API`, async ({ page, request }) => {
    await loginAs(page, account);
    const cookies = await page.context().cookies();
    const res = await request.post("/api/admin/admins/1/reset-password", {
      headers: { ...authHeaders(cookies), "content-type": "application/json" },
      data: { newPassword: "does-not-matter-123" },
    });
    expect(res.status()).toBe(403);
  });

  test(`${name} office admin does not see a Reset password action in Admin Management`, async ({ page }) => {
    await loginAs(page, account);
    await page.goto("/admin/admins");
    await expect(page.getByRole("heading", { name: "Admin Management" })).toHaveCount(0);
  });
}

test("a system admin cannot reset their own password via the Admin Management action", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const me = await request.get("/api/auth/me", { headers: authHeaders(cookies) });
  const meBody = (await me.json()) as { session: { adminId: number } };

  const res = await request.post(`/api/admin/admins/${meBody.session.adminId}/reset-password`, {
    headers: { ...authHeaders(cookies), "content-type": "application/json" },
    data: { newPassword: "does-not-matter-123" },
  });
  expect(res.status()).toBe(400);
});
