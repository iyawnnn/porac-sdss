import { expect, type Page } from "@playwright/test";

// Shared by every spec that needs an authenticated session — replaces the
// ~7 near-identical inline loginAdmin/loginCitizen copies that used to be
// duplicated per spec file.
//
// The dev-mode two-process setup (Next.js dev server + NestJS API, both on
// localhost) occasionally drops a request with a network-level failure
// (ECONNREFUSED) under the connection churn a full --workers=1 suite run
// produces — this is infrastructure flakiness, not an auth/rate-limit
// behavior, and AdminLoginForm/LoginForm now surface it as a visible,
// retryable error instead of hanging forever (see their `catch` blocks).
// Retrying here only when that specific error text is showing is the
// second line of defense: a genuine credential/authorization failure shows
// a *different* error and is never retried, so this can't mask an RBAC
// regression — it only re-submits after a proven-transient connection blip.
const TRANSIENT_LOGIN_ERROR = "Could not reach the server. Please try again.";
// 25s, not the original 15s: page snapshots captured from real full-suite
// failures showed the submit button still reading "Signing in…" (fetch
// genuinely still in flight, not rejected) at the 15s mark under sustained
// --workers=1 load — this is evidenced, specific tuning for one network
// wait, not a blanket/global timeout increase.
const NAV_TIMEOUT = 25_000;
const MAX_ATTEMPTS = 3;

async function submitWithRetry(
  page: Page,
  submitButtonName: string,
  expectedUrl: RegExp,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await page.getByRole("button", { name: submitButtonName }).click();
    try {
      await page.waitForURL(expectedUrl, { timeout: NAV_TIMEOUT });
      return;
    } catch (err) {
      const isTransient = await page
        .getByText(TRANSIENT_LOGIN_ERROR)
        .isVisible()
        .catch(() => false);
      if (!isTransient || attempt === MAX_ATTEMPTS) throw err;
      // Transient connection blip and attempts remain — the form fields
      // are untouched by the error path, so re-clicking submit is enough.
    }
  }
}

export async function loginAdmin(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByPlaceholder("Password").fill(account.password);
  await submitWithRetry(page, "Sign In", /\/admin$/);
  await expect(page.getByText("Incident Reports Over Time")).toBeVisible();
}

export async function loginCitizen(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByPlaceholder("Password").fill(account.password);
  await submitWithRetry(page, "Sign In with Email", /\/dashboard/);
}
