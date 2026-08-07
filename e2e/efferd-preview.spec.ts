import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN } from "./test-credentials";

test.setTimeout(60_000);

// The 15s timeout (vs. Playwright's 5s default) tolerates the Next.js dev
// server's on-demand Turbopack compilation of a route on its first hit in a
// spec file — a cold /admin/login or /admin compile can take longer than 5s,
// while every subsequent hit to the same route within the run is fast. This
// matches the same class of dev-server timing issue admin-flagged.spec.ts's
// gotoFlagged() already works around for hydration.
async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_MEO_ADMIN.email);
  await page.getByPlaceholder("Password").fill(E2E_MEO_ADMIN.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
}

test("efferd-preview remains an authenticated internal alias", async ({ page }) => {
  await page.goto("/efferd-preview");
  await expect(page).toHaveURL(/\/admin\/login/, { timeout: 15_000 });
  await loginAdmin(page);
  await page.goto("/efferd-preview");
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
});

test("efferd-preview and production admin do not emit hydration mismatch warnings", async ({ page }) => {
  const hydrationMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|hydrated/i.test(message.text())) hydrationMessages.push(message.text());
  });
  await loginAdmin(page);
  await page.goto("/efferd-preview");
  await expect(page.getByText("Incident Reports Over Time")).toBeVisible();
  expect(hydrationMessages).toEqual([]);
});