import { expect, type Locator, type Page } from "@playwright/test";

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

// app/error.tsx and app/admin/error.tsx now catch the throw this used to be
// the only mitigation for (an unhandled throw in app/admin/layout.tsx's
// unguarded getAdminSessionFromApi() call, from the same dev-only
// ECONNREFUSED blip lib/api-client.ts already documents and retries for).
// This helper stays as defense-in-depth: it also absorbs mid-run connection
// churn between navigations, which a mount-time error boundary doesn't
// cover, and a spec that navigated at exactly the wrong moment would
// otherwise fail on a missing element rather than on anything it was
// actually testing.
//
// Reloading is exactly what that screen's own Reload button does, and it
// only fires while that screen is showing — a genuine 401/403/404, a wrong
// page, or a real regression is never retried. The caller's own assertion
// still has to pass afterwards, so a persistently broken page still fails,
// just two reloads later.
//
// The regex avoids hard-coding the typographic apostrophe in "couldn’t".
const SERVER_ERROR_HEADING = /This page could.{0,3}t load/;
const MAX_RELOADS = 2;

export async function settleAdminPage(page: Page, ready: Locator): Promise<void> {
  const errorScreen = page.getByRole("heading", { name: SERVER_ERROR_HEADING });
  for (let attempt = 0; attempt <= MAX_RELOADS; attempt++) {
    try {
      // Whichever actually renders resolves this — no polling, no sleep, and
      // no race against a page that is still streaming.
      await expect(ready.or(errorScreen).first()).toBeVisible();
    } catch {
      return; // neither appeared; let the caller's assertion report it clearly
    }
    if (!(await errorScreen.isVisible())) return;
    if (attempt === MAX_RELOADS) return; // give up, caller reports the failure
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}

export async function loginAdmin(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  await page.goto("/admin/login");
  const email = page.getByLabel("Email");
  await settleAdminPage(page, email);
  await email.fill(account.email);
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
