import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin as sharedLoginAdmin } from "./helpers";

test.setTimeout(60_000);

async function loginAdmin(page: import("@playwright/test").Page) {
  await sharedLoginAdmin(page, E2E_MEO_ADMIN);
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