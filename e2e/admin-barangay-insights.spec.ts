import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

// --- Sidebar / route -------------------------------------------------------

test("Barangay Insights sidebar link exists and navigates to a real route", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const nav = page.getByRole("navigation", { name: "Admin" });
  const link = nav.getByRole("link", { name: "Barangay Insights", exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/barangay-insights$/);
  await expect(page.getByRole("heading", { name: "Barangay Insights" })).toBeVisible();
});

test("no citizen route can access Barangay Insights", async ({ page }) => {
  // proxy.ts redirects any unauthenticated /admin/* request to /admin/login
  // (page-redirect UX only) rather than a bare 401 — same behavior as every
  // other admin page route (see e2e/admin-reports.spec.ts).
  const pageRes = await page.request.get("/admin/barangay-insights");
  expect(pageRes.ok()).toBe(true);
  expect(pageRes.url()).toContain("/admin/login");

  const apiRes = await page.request.get("/api/admin/barangay-insights");
  expect(apiRes.status()).toBe(401);
});

// --- Index page: all 29 barangays, office scoping ---------------------------

test("index page lists all 29 barangays", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights");
  await expect(page.getByRole("table")).toBeVisible();
  // 29 data rows + no header counted by tbody role query — count rows with a
  // barangay name link, since the header row has no link.
  const nameLinks = page.getByRole("table").locator("tbody a");
  await expect(nameLinks).toHaveCount(29);
});

test("MEO admin sees a fixed office badge, not a picker, on the index page", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights");
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MEO");
  await expect(page.getByRole("combobox", { name: "Office" })).toHaveCount(0);
});

test("MDRRMO admin sees a fixed office badge, not a picker, on the index page", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin/barangay-insights");
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MDRRMO");
  await expect(page.getByRole("combobox", { name: "Office" })).toHaveCount(0);
});

test("system admin sees an office picker defaulting to all offices", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/barangay-insights");
  const officeFilter = page.getByRole("combobox", { name: "Office", exact: true });
  await expect(officeFilter).toBeVisible();

  await officeFilter.click();
  await page.getByRole("option", { name: "MEO" }).click();
  // Still 29 barangays — office scoping narrows the tickets counted per row,
  // never the set of barangays shown.
  await expect(page.getByRole("table").locator("tbody a")).toHaveCount(29);
});

test("MEO office-scoped index API never includes MDRRMO-only ticket counts higher than MDRRMO's own view", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const headers = sessionCookieHeader(cookies);
  const res = await request.get("/api/admin/barangay-insights", { headers });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.office).toBe("MEO");
  expect(Array.isArray(body.barangays)).toBe(true);
  expect(body.barangays.length).toBe(29);
});

test("a hand-crafted ?office=MDRRMO request from an MEO session is clamped to MEO", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const headers = sessionCookieHeader(cookies);
  const res = await request.get("/api/admin/barangay-insights?office=MDRRMO", { headers });
  const body = await res.json();
  expect(body.office).toBe("MEO");
});

// --- Sorting ------------------------------------------------------------------

async function totalColumnValues(page: import("@playwright/test").Page): Promise<number[]> {
  const rows = page.getByRole("table").locator("tbody tr");
  const count = await rows.count();
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(Number(await rows.nth(i).locator("td").nth(1).innerText()));
  }
  return values;
}

test("clicking the Total header sorts descending, and a second click reverses to ascending", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights");
  await expect(page.getByRole("table")).toBeVisible();

  const totalHeader = page.getByRole("button", { name: "Total" });
  await totalHeader.click();
  const descending = await totalColumnValues(page);
  expect(descending).toEqual([...descending].sort((a, b) => b - a));

  await totalHeader.click();
  const ascending = await totalColumnValues(page);
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
});

test("search still composes with the active sort", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights");
  await page.getByRole("button", { name: "Total" }).click();

  // "Man" narrows to a real, known subset (Mancatian, Manibaug Libutad,
  // Manibaug Paralaya, Manibaug Pasig, Manuali) without ever matching all
  // or none of the 29 barangays.
  await page.getByLabel("Search barangays").fill("Man");
  const nameLinks = page.getByRole("table").locator("tbody a");
  await expect(nameLinks).toHaveCount(5);

  const values = await totalColumnValues(page);
  expect(values).toEqual([...values].sort((a, b) => b - a));
});

// --- Profile page ------------------------------------------------------------

test("clicking a barangay opens its profile page with KPIs, category breakdown, trend, elevation, and recent tickets", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights");
  const firstRowLink = page.getByRole("table").locator("tbody a").first();
  await firstRowLink.click();

  // Read the barangay id from the URL actually navigated to (post-click),
  // then assert the profile heading against a fresh lookup of that same
  // barangay — not a name captured from the index page before the click,
  // which can point at a different row if the list re-sorts between the
  // read and the click.
  await expect(page).toHaveURL(/\/admin\/barangay-insights\/\d+$/);
  const barangayId = new URL(page.url()).pathname.split("/").pop();
  const cookies = await page.context().cookies();
  const profileRes = await page.request.get(`/api/admin/barangay-insights/${barangayId}`, { headers: sessionCookieHeader(cookies) });
  expect(profileRes.ok()).toBe(true);
  const profileBody = await profileRes.json();
  const barangayName = profileBody.barangay_name as string;

  await expect(page.getByRole("heading", { name: barangayName, exact: true })).toBeVisible();
  await expect(page.getByText("Total Tickets", { exact: true })).toBeVisible();
  await expect(page.getByText("Active Tickets", { exact: true })).toBeVisible();
  await expect(page.getByText("Resolved Tickets", { exact: true })).toBeVisible();
  await expect(page.getByText("High Urgency Tickets", { exact: true })).toBeVisible();
  // CardTitle renders a styled <div>, not a semantic heading element (same
  // as every other admin card in this app) — getByText is the established
  // convention for asserting on it (see admin-dashboard-performance-summary.spec.ts).
  await expect(page.getByText("Category Breakdown", { exact: true })).toBeVisible();
  await expect(page.getByText("Incident Trend", { exact: true })).toBeVisible();
  await expect(page.getByText("Elevation Summary", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent Tickets", { exact: true })).toBeVisible();
});

test("recent tickets deep-link to the Ticket Queue filtered by barangayId", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights");
  await page.getByRole("table").locator("tbody a").first().click();
  await expect(page).toHaveURL(/\/admin\/barangay-insights\/(\d+)$/);
  const barangayId = new URL(page.url()).pathname.split("/").pop();

  const viewAllLink = page.getByRole("link", { name: "View all in Ticket Queue" });
  await expect(viewAllLink).toHaveAttribute("href", new RegExp(`/admin/tickets\\?barangayId=${barangayId}$`));
});

test("a nonexistent barangay id shows a not-found page", async ({ page }) => {
  // Same convention as every other notFound()-in-Suspense page in this app
  // (e.g. e2e/admin-management.spec.ts) — Next streams the not-found
  // boundary client-side rather than a raw HTTP 404 on the initial request,
  // so the assertion is on the rendered page, not page.request.get's status.
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights/999999");
  await expect(page.getByText(/this page could not be found/i)).toBeVisible();
});

test("system admin sees an office toggle on the profile page; MEO/MDRRMO admins do not", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/barangay-insights");
  await page.getByRole("table").locator("tbody a").first().click();
  await expect(page.getByRole("group", { name: "Office" })).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights");
  await page.getByRole("table").locator("tbody a").first().click();
  await expect(page.getByRole("group", { name: "Office" })).toHaveCount(0);
});

// --- No unrelated features ---------------------------------------------------

test("no editing, export, or CSV controls appear anywhere on Barangay Insights", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/barangay-insights");
  // Scoped to <main> — the sidebar's unrelated "Reports & Exports" nav link
  // would otherwise false-positive match /export/i.
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: /edit/i })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /export/i })).toHaveCount(0);
  await page.getByRole("table").locator("tbody a").first().click();
  await expect(main.getByRole("button", { name: /edit/i })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /export/i })).toHaveCount(0);
});
