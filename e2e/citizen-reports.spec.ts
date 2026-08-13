import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin as sharedLoginAdmin, loginCitizen as sharedLoginCitizen } from "./helpers";

test.setTimeout(60_000);

interface MyReportRow {
  id: number;
  ticket_id: number;
  title: string;
  category: string;
  barangay_name: string;
  status: string;
  assigned_office: "MEO" | "MDRRMO";
  member_count: number;
  moderation_status: string | null;
  is_merged: boolean;
}

async function loginCitizen(page: Page) {
  await sharedLoginCitizen(page, E2E_CITIZEN_ACCOUNT);
}

async function loginAdmin(page: Page) {
  await sharedLoginAdmin(page, E2E_MEO_ADMIN);
}

async function fetchMyReports(page: Page): Promise<MyReportRow[]> {
  return page.evaluate(async () => {
    const res = await fetch("/api/reports/mine");
    return (await res.json()) as MyReportRow[];
  });
}

test.describe("My Reports list", () => {
  test("shows the citizen's own reports with category, barangay, status, office, and a working detail link", async ({ page }) => {
    await loginCitizen(page);
    const reports = await fetchMyReports(page);
    test.skip(reports.length === 0, "citizen1 has no seeded reports — run `pnpm --prefix api seed:diverse-reports` first");

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "My Reports" })).toBeVisible();

    const first = reports[0];
    await expect(page.getByText(first.category).first()).toBeVisible();
    await expect(page.getByText(first.barangay_name).first()).toBeVisible();
    await expect(page.getByText(first.status, { exact: true }).first()).toBeVisible();

    await page.getByRole("link", { name: "View Details" }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/reports\/\d+/);
  });

  test("shows an empty-state message and a Report Hazard call to action when there are no reports", async ({ page }) => {
    // Exercises the same empty-state branch the list page renders for a
    // zero-report citizen, without depending on one existing in seed data —
    // a fresh signup always starts with zero reports.
    const email = `e2e-empty-${Date.now()}@porac.ph`;
    await page.goto("/signup");
    await page.getByLabel("First name").fill("Empty");
    await page.getByLabel("Last name").fill("State");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("PoracDemo2026!");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/reports");
    await expect(page.getByText("No reports yet")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Report Hazard" })).toBeVisible();
  });
});

test.describe("Report detail timeline", () => {
  test("renders a submitted event and the current status", async ({ page }) => {
    await loginCitizen(page);
    const reports = await fetchMyReports(page);
    test.skip(reports.length === 0, "citizen1 has no seeded reports — run `pnpm --prefix api seed:diverse-reports` first");

    await page.goto(`/dashboard/reports/${reports[0].id}`);
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Report timeline" }).getByText("Report submitted")).toBeVisible();
    await expect(page.getByText(reports[0].status, { exact: true }).first()).toBeVisible();
  });

  test("shows a merge banner for a report that joined an existing ticket", async ({ page }) => {
    await loginCitizen(page);
    const reports = await fetchMyReports(page);
    const merged = reports.find((r) => r.is_merged);
    test.skip(!merged, "no merged report in citizen1's seeded data — run `pnpm --prefix api seed:diverse-reports` first");

    await page.goto(`/dashboard/reports/${merged!.id}`);
    await expect(page.getByText("Merged with an existing issue").first()).toBeVisible();
    await expect(page.getByText(/Grouped with \d+ other report/)).toBeVisible();
  });

  test("shows a citizen-safe banner, matching notification wording, after an admin quarantines the report", async ({ page, browser }: { page: Page; browser: Browser }) => {
    await loginCitizen(page);
    const reports = await fetchMyReports(page);
    const pending = reports.find((r) => r.moderation_status === null);
    // moderation is a one-way transition — after the first successful run
    // against a given database, no report is left pending until the next
    // `seed:diverse-reports` reseed. Skipping (not failing) keeps reruns
    // against a already-exercised database green instead of flaky.
    test.skip(!pending, "no pending (unmoderated) report left for citizen1 — reseed with `pnpm --prefix api seed:diverse-reports` to re-run this test");

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage);
    const moderateRes = await adminContext.request.post(`/api/admin/reports/${pending!.id}/moderate`, {
      data: { action: "quarantine", note: "e2e regression check" },
    });
    expect(moderateRes.ok()).toBe(true);
    await adminContext.close();

    await page.goto(`/dashboard/reports/${pending!.id}`);
    await expect(page.getByText("Report under additional review")).toBeVisible();
    await expect(
      page.getByText(/needs another look before it appears on the public map\. This does not affect your ticket's progress\./),
    ).toBeVisible();
    await expect(page.getByText("Under additional review", { exact: true })).toBeVisible();
  });
});

test.describe("Mobile viewport", () => {
  test("My Reports and report detail stay overflow-free on a 375px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await loginCitizen(page);
    const reports = await fetchMyReports(page);
    test.skip(reports.length === 0, "citizen1 has no seeded reports — run `pnpm --prefix api seed:diverse-reports` first");

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "My Reports" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);

    await page.goto(`/dashboard/reports/${reports[0].id}`);
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  });
});

test.describe("Notification click-through", () => {
  test("clicking a report-received notification navigates to that report's detail page", async ({ page }) => {
    // A fresh signup, not citizen1 — submission is rate-limited per account
    // (5/hour) and per location (3/hour), and citizen1 is reused across
    // every other test in this file. A throwaway account keeps this test
    // rerun-safe regardless of how many times the suite has run this hour.
    const email = `e2e-notif-${Date.now()}@porac.ph`;
    await page.goto("/signup");
    await page.getByLabel("First name").fill("Notif");
    await page.getByLabel("Last name").fill("Click");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("PoracDemo2026!");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Trigger a fresh notification by submitting a real report through the
    // API directly — the UI form is already covered end-to-end by
    // smoke.spec.ts; this test's concern is notification click-through, not
    // re-proving the submission form works. Municipality center (see
    // lib/municipality-config.ts's default centerLat/centerLng) — guaranteed
    // inside the accepted boundary. Coordinates are jittered per run so
    // repeated test runs within the 7-day duplicate-merge window each
    // create a brand-new ticket rather than merging into a prior run's —
    // a merge produces a "Report update" notification instead of "Report
    // received", which this test doesn't care about distinguishing.
    const { readFileSync } = await import("node:fs");
    const jitter = () => (Math.random() - 0.5) * 0.01;
    const submitRes = await page.request.post("/api/reports", {
      multipart: {
        title: "E2E notification click-through check",
        category: "Pothole",
        citizen_severity: "Low",
        lat: String(15.0711 + jitter()),
        lng: String(120.5401 + jitter()),
        image: {
          name: "01_poblacion.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync("public/uploads/reports/01_poblacion.jpg"),
        },
      },
    });
    expect(submitRes.ok()).toBe(true);
    const submitted = (await submitRes.json()) as { reportId: number };

    // Wait for the dashboard's own hydration/fetch to settle before opening
    // the bell — same race admin-flagged.spec.ts's gotoFlagged() documents:
    // a click fired the instant the SSR HTML paints can land before React
    // attaches handlers or before the bell's own notification fetch resolves.
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /notifications/i }).click();
    // This is a brand-new signup with zero prior notifications, so whatever
    // shows up first is unambiguously the one this submission just created
    // — no need to match its exact title (which differs between a
    // brand-new ticket and a same-window merge, see comment above).
    const item = page.getByRole("menuitem").first();
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.click();

    // Not asserted deeper than "landed on the right page" — the exact
    // banner/status text for a report is already covered by the timeline
    // tests above.
    await expect(page).toHaveURL(new RegExp(`/dashboard/reports/${submitted.reportId}$`));
    await expect(page.getByText("Report submitted", { exact: false }).first()).toBeVisible();
  });
});

test.describe("Cross-account access", () => {
  test("citizen B cannot read citizen A's report, and the rejection is indistinguishable from a nonexistent report id", async ({ page, browser }: { page: Page; browser: Browser }) => {
    await loginCitizen(page);
    const reports = await fetchMyReports(page);
    test.skip(reports.length === 0, "citizen1 has no seeded reports — run `pnpm --prefix api seed:diverse-reports` first");
    const reportAId = reports[0].id;

    // Fresh citizen B, in a separate browser context — zero reports, adds
    // nothing to the report-creation budget (docs/testing.md §6). A second
    // context (same pattern as the admin-quarantine test above) is required
    // here, not the "empty-state"/"notification click-through" tests' inline
    // single-page signup: those start from an unauthenticated page, but this
    // page is already logged in as citizen1, and proxy.ts redirects an
    // already-authenticated citizen away from /signup back to /dashboard.
    const bContext = await browser.newContext();
    const bPage = await bContext.newPage();
    const email = `e2e-crossaccount-${Date.now()}@porac.ph`;
    await bPage.goto("/signup");
    await bPage.getByLabel("First name").fill("Cross");
    await bPage.getByLabel("Last name").fill("Account");
    await bPage.getByLabel("Email").fill(email);
    await bPage.getByLabel("Password", { exact: true }).fill("PoracDemo2026!");
    await bPage.getByRole("button", { name: "Create Account" }).click();
    await expect(bPage).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    const nonexistentId = reportAId + 999_000; // guaranteed past any real id

    const [ownedResult, nonexistentResult] = await bPage.evaluate(
      async ([ownedId, missingId]) => {
        const [ownedRes, missingRes] = await Promise.all([
          fetch(`/api/reports/mine/${ownedId}`),
          fetch(`/api/reports/mine/${missingId}`),
        ]);
        return [
          { status: ownedRes.status, body: await ownedRes.json() },
          { status: missingRes.status, body: await missingRes.json() },
        ];
      },
      [reportAId, nonexistentId],
    );

    // Citizen B must not receive citizen A's data...
    expect(ownedResult.status).not.toBe(200);
    // ...and the rejection must be indistinguishable — same status AND same
    // body — from a nonexistent id. This is the property that proves there
    // is no existence oracle: "not 200" alone would still pass if a future
    // refactor leaked existence through a different status or body shape
    // between the two cases.
    expect(ownedResult.status).toBe(nonexistentResult.status);
    expect(ownedResult.body).toEqual(nonexistentResult.body);

    await bContext.close();
  });
});
