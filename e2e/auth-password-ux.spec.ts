import { expect, test } from "@playwright/test";

const loginPages = [
  { path: "/login", endpoint: "/api/citizens/login", destination: "/dashboard" },
  { path: "/admin/login", endpoint: "/api/admin/login", destination: "/admin" },
];

for (const theme of ["light", "dark"]) {
  test.describe(theme, () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("porac-theme", value), theme);
    });

    test("the reset-link form shows its success confirmation", async ({ page }) => {
      await page.route("**/api/citizens/forgot-password", (route) => route.fulfill({ json: {} }));
      await page.goto("/forgot-password");
      await page.getByLabel("Email").fill("someone@example.test");
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.locator("[data-slot=alert][role=status]")).toContainText("we've sent a link");
    });

    for (const { path, endpoint, destination } of loginPages) {
      test(`${path} keeps retry errors mounted and discards stale responses`, async ({ page }) => {
        let requests = 0;
        let release = () => {};
        await page.route(`**${endpoint}`, async (route) => {
          requests++;
          if (requests === 2 || requests === 3) {
            await new Promise<void>((resolve) => { release = resolve; });
          }
          if (requests === 4) return route.abort("connectionrefused");
          if (requests === 5) return route.fulfill({ status: 200, json: {} });
          return route.fulfill({
            status: 401,
            json: { message: requests === 1 ? "Invalid email or password" : "Try again later" },
          });
        });
        // Observe the browser redirect without relying on a live account or session.
        await page.route(`**${destination}`, (route) => route.fulfill({ status: 200, body: "Signed in" }));
        await page.goto(path);
        if (theme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

        const password = page.getByLabel("Password", { exact: true });
        await expect(password).toHaveAttribute("placeholder", "••••••••");
        await expect(password).toHaveAttribute("type", "password");
        await expect(password).toHaveAttribute("autocomplete", "current-password");
        await expect(password).toHaveValue("");
        await expect(page.getByText("At least 8 characters.", { exact: true })).toHaveCount(0);
        await page.getByLabel("Email").fill("someone@example.test");
        await password.fill("wrong-password");
        await page.getByRole("button", { name: "Show password" }).click();
        await expect(password).toHaveAttribute("type", "text");
        await page.getByRole("button", { name: "Hide password" }).click();
        await expect(password).toHaveAttribute("type", "password");

        const submit = page.getByRole("button", { name: "Sign In", exact: true });
        const busy = page.getByRole("button", { name: "Signing in…" });
        const alert = page.locator("[data-slot=alert][role=alert]");
        await submit.click();
        await expect(alert).toHaveText("Invalid email or password");
        await alert.evaluate((el) => { el.dataset.retryTest = "original"; });
        await submit.click();
        await expect(busy).toBeDisabled();
        await expect(alert).toHaveText("Invalid email or password");
        await expect.poll(() => requests).toBe(2);
        release();
        await expect(alert).toHaveText("Try again later");
        await expect(alert).toHaveAttribute("data-retry-test", "original");

        await submit.click();
        await expect.poll(() => requests).toBe(3);
        await password.fill("changed-password");
        await expect(alert).toHaveCount(0);
        release();
        await expect(submit).toBeEnabled();
        await expect(alert).toHaveCount(0);
        await submit.click();
        await expect(alert).toContainText("Could not reach the server");
        await page.getByLabel("Email").fill("changed@example.test");
        await expect(alert).toHaveCount(0);
        await submit.click();
        await expect(page).toHaveURL(new RegExp(`${destination}$`));
        expect(requests).toBe(5);
      });
    }

    for (const path of ["/signup", "/reset-password?token=e2e-token"]) {
      const signup = path === "/signup";
      test(`${path} shows the endpoint's password requirements as you type`, async ({ page }) => {
        await page.route("**/api/citizens/reset-password/validate**", (route) =>
          route.fulfill({ json: { valid: true } }),
        );
        await page.goto(path);
        const password = page.getByLabel(signup ? "Password" : "New password", { exact: true });
        await expect(password).toHaveAttribute("placeholder", "••••••••");
        await expect(password).toHaveAttribute("type", "password");
        await expect(password).toHaveAttribute("autocomplete", "new-password");
        await expect(password).toHaveValue("");
        const description = page.locator("[data-slot=field-description]");
        await expect(description.getByText("At least 8 characters.", { exact: true })).toBeVisible();
        await expect(description).not.toContainText("bytes");
        await expect(description.locator("svg.lucide-circle-x")).toBeVisible();
        await expect(description).toHaveClass(/\btext-danger-ink\b/);
        await expect(password).toHaveAccessibleDescription(/At least 8 characters\.\s*— Not met/);
        const border = await password.evaluate((input) => getComputedStyle(input).borderColor);

        await password.fill("1234567");
        await expect(description.locator("svg.lucide-circle-x")).toBeVisible();
        await password.fill("12345678");
        await expect(description.locator("svg.lucide-circle-check")).toBeVisible();
        await expect(description).toHaveClass(/\btext-status-resolved-ink\b/);
        await expect(password).toHaveAccessibleDescription(/At least 8 characters\.\s*— Met/);
        await password.press("Backspace");
        await expect(description.locator("svg.lucide-circle-x")).toBeVisible();
        await expect(description).toHaveClass(/\btext-danger-ink\b/);
        await expect(password).not.toHaveAttribute("aria-invalid", "true");
        await password.blur();
        await expect(password).toHaveCSS("border-color", border);
        await password.fill("12345678");
        await page.getByRole("button", { name: "Show password" }).click();
        await expect(password).toHaveAttribute("type", "text");
        await page.getByRole("button", { name: "Hide password" }).click();
        await expect(password).toHaveAttribute("type", "password");
        expect(await page.locator("html").evaluate((el) => el.scrollWidth)).toBe(390);

        if (signup) {
          await page.route("**/dashboard**", (route) => route.fulfill({ contentType: "text/html", body: "Account created" }));
          await page.getByLabel("First name").fill("Test");
          await page.getByLabel("Last name").fill("Citizen");
          await page.getByLabel("Email").fill("someone@example.test");
          const tooLong = "Password is too long. Please use a shorter password.";
          await page.route(
            "**/api/citizens/signup",
            (route) => route.fulfill({ status: 400, json: { message: tooLong } }),
            { times: 1 },
          );
          await password.fill("é".repeat(37));
          await page.getByRole("button", { name: "Create Account" }).click();
          await expect(page.locator("[data-slot=alert][role=alert]")).toHaveText(tooLong);
          await page.route("**/api/citizens/signup", (route) => route.fulfill({ json: {} }));
          await password.fill("12345678");
          await page.getByRole("button", { name: "Create Account" }).click();
          await expect(page).toHaveURL(/\/dashboard$/);
        } else {
          await page.route("**/api/citizens/reset-password", (route) => route.fulfill({ json: {} }));
          await page.getByRole("button", { name: "Reset password" }).click();
          await expect(page).toHaveURL(/\/login\?notice=password_reset$/);
        }
      });
    }
  });
}
