import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("meo@porac.gov.ph");
  await page.getByPlaceholder("Password").fill("PoracDemo2026!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("efferd-preview remains an authenticated internal alias", async ({ page }) => {
  await page.goto("/efferd-preview");
  await expect(page).toHaveURL(/\/admin\/login/);
  await loginAdmin(page);
  await page.goto("/efferd-preview");
  await expect(page).toHaveURL(/\/admin$/);
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