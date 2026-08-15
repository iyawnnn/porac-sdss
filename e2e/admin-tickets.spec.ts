
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs, loginCitizen, settleAdminPage } from "./helpers";

test.setTimeout(60_000);

function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

// Creates a brand-new, disposable ticket via the same POST /api/reports
// multipart flow citizen-dispute.spec.ts already established — used instead
// of mutating a shared seeded ticket wherever the mutation (status advance)
// has no revert endpoint to restore it with afterwards. "Pothole / Road
// Surface Damage" always routes to MEO (api/src/common/utils/office.ts), so
// E2E_MEO_ADMIN can act on it without any additional reassignment.
async function createThrowawayReport(citizenPage: Page, titleSuffix: string): Promise<{ reportId: number; ticketId: number }> {
  // Pothole's dedup merge radius is 25m (api/src/common/utils/radius.ts) —
  // a fixed lat/lng would silently merge into whatever other fixture (e.g.
  // citizen-dispute.spec.ts's own Pothole reports) already sits at that
  // exact point instead of creating a genuinely new ticket. The jitter here
  // (~±550m) mirrors citizen-dispute.spec.ts's own jitter() for the same
  // reason: comfortably clear of the merge radius.
  const jitter = () => (Math.random() - 0.5) * 0.01;
  const title = `E2E ticket-workflow ${titleSuffix}`;
  const res = await citizenPage.request.post("/api/reports", {
    multipart: {
      title,
      category: "Pothole / Road Surface Damage",
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
  if (!res.ok()) {
    const bodyText = await res.text().catch((e) => `<failed to read body: ${e}>`);
    throw new Error(
      `createThrowawayReport: POST /api/reports failed for title "${title}" — status ${res.status()} ${res.statusText()}\nbody: ${bodyText}`,
    );
  }
  return (await res.json()) as { reportId: number; ticketId: number };
}

async function signupCitizen(page: Page, label: string): Promise<{ email: string; password: string }> {
  const email = `e2e-tickets-${label}-${Date.now()}@porac.ph`;
  const password = "PoracDemo2026!";
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Ticket");
  await page.getByLabel("Last name").fill(label);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  return { email, password };
}

// Shared by three tests that only read a ticket — queue→detail navigation,
// Ticket Detail's read-only sections, and the mobile card list — none of
// which advance status, reassign office, resolve, or dispute, or assert on
// any particular status/office value, so a shared ticket can't leak state
// between them. Safe only under this file's mandatory --workers=1 (no
// per-test DB isolation), same reasoning as admin-work-orders.spec.ts's
// sharedMeoTicketId and this file's own resolvedFixture below.
let sharedReadOnlyTicketId: number;

test.beforeAll(async ({ browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "shared-readonly");
  ({ ticketId: sharedReadOnlyTicketId } = await createThrowawayReport(citizenPage, `shared-readonly-${Date.now()}`));
  await citizenContext.close();
});

// --- 1. Ticket Queue baseline ---------------------------------------------

test("authenticated admin can open the Ticket Queue and see its content", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets");
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  // Either seeded rows or the documented empty state must render — never a
  // blank/broken page.
  const table = page.getByRole("table");
  const hasRows = (await table.getByRole("row").count()) > 1; // header row + N data rows
  if (hasRows) {
    await expect(page.getByRole("link", { name: "View ticket" }).first()).toBeVisible();
  } else {
    await expect(page.getByText("No tickets match this filter.")).toBeVisible();
  }
});

// --- 2. Ticket Queue filters -----------------------------------------------

test("status filter changes the visible ticket set", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Status", { exact: true }).click();
  await page.getByRole("option", { name: "Resolved", exact: true }).click();
  await expect(page).toHaveURL(/[?&]status=Resolved(&|$)/);
  await page.waitForLoadState("networkidle");

  const rows = page.getByRole("row").filter({ hasText: "View ticket" });
  const count = await rows.count();
  if (count === 0) {
    await expect(page.getByText("No tickets match this filter.")).toBeVisible();
  } else {
    // Every visible data row must actually carry the Resolved status pill.
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).getByText("Resolved", { exact: true })).toBeVisible();
    }
  }
});

test("search filter narrows results to the searched ticket", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/tickets?office=MEO&status=all&limit=1", { headers: sessionCookieHeader(cookies) });
  const body = await res.json();
  test.skip(body.tickets.length === 0, "no MEO tickets seeded — run `pnpm --prefix api seed:diverse-reports` first");
  const target = body.tickets[0] as { id: number };

  await page.goto("/admin/tickets?status=all");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Search tickets").fill(String(target.id));
  await expect(page).toHaveURL(new RegExp(`[?&]search=${target.id}(&|$)`), { timeout: 5000 });
  await page.waitForLoadState("networkidle");

  // Search matches on exact ticket ID OR a title/barangay substring
  // (TicketsService.getTicketsForAdmin), so a bare count of 1 isn't
  // guaranteed once enough disposable E2E tickets accumulate in a shared
  // dev DB — a numeric ID can coincidentally substring-match another
  // ticket's title. What must hold is that the target ticket itself is
  // among the results.
  const rows = page.getByRole("row").filter({ hasText: "View ticket" });
  await expect(rows.first()).toBeVisible();
  await expect(page.getByText(`#${target.id}`, { exact: true })).toBeVisible();
});

test("disputed-only filter shows only disputed tickets or the empty state", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Disputed only" }).click();
  await expect(page).toHaveURL(/[?&]disputed=true(&|$)/);
  await page.waitForLoadState("networkidle");

  const rows = page.getByRole("row").filter({ hasText: "View ticket" });
  const count = await rows.count();
  if (count === 0) {
    await expect(page.getByText("No tickets match this filter.")).toBeVisible();
  } else {
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).getByText("Disputed", { exact: true })).toBeVisible();
    }
  }
});

test("reset filters clears status, search, and disputed back to defaults", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all&search=zzz&disputed=true");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("button", { name: "Reset filters" })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();

  await expect(page).not.toHaveURL(/disputed=true/);
  await expect(page).not.toHaveURL(/search=zzz/);
  await expect(page.getByRole("button", { name: "Reset filters" })).toHaveCount(0);
  await expect(page.getByLabel("Search tickets")).toHaveValue("");
});

// --- 3. Office scoping ------------------------------------------------------

test("MEO admin only sees MEO-scoped tickets", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/tickets?office=MEO&status=all&limit=50", { headers: sessionCookieHeader(cookies) });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.tickets.every((t: { assigned_office: string }) => t.assigned_office === "MEO")).toBe(true);
});

test("MDRRMO admin only sees MDRRMO-scoped tickets", async ({ page, request }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/tickets?office=MDRRMO&status=all&limit=50", { headers: sessionCookieHeader(cookies) });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.tickets.every((t: { assigned_office: string }) => t.assigned_office === "MDRRMO")).toBe(true);
});

test("a doctored office query value does not widen an office admin's visibility", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/tickets?office=MDRRMO&status=all&limit=50", { headers: sessionCookieHeader(cookies) });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  // resolveOfficeScope clamps a non-system-admin to their own office
  // regardless of what the office param asks for.
  expect(body.tickets.every((t: { assigned_office: string }) => t.assigned_office === "MEO")).toBe(true);

  const allRes = await request.get("/api/admin/tickets?office=all&status=all&limit=50", { headers: sessionCookieHeader(cookies) });
  const allBody = await allRes.json();
  expect(allBody.tickets.every((t: { assigned_office: string }) => t.assigned_office === "MEO")).toBe(true);
});

test("system admin sees an office picker exposing a city-wide view", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/tickets");
  const officePicker = page.getByLabel("Office", { exact: true });
  await expect(officePicker).toBeVisible();
  await expect(officePicker).toHaveText("All offices");
});

// --- 4. Queue to Detail navigation ------------------------------------------

test("clicking a ticket from the queue opens its detail page and back link returns to the queue", async ({ page }) => {
  const ticketId = sharedReadOnlyTicketId;

  await loginAs(page, E2E_MEO_ADMIN);
  // Search-filtered to this disposable ticket specifically — the queue's
  // default order isn't stable across a full-suite run (other specs create,
  // resolve, and reassign tickets), so "first row" isn't guaranteed to be
  // this ticket even though it always exists.
  await page.goto(`/admin/tickets?status=all&search=${ticketId}`);
  await page.waitForLoadState("networkidle");

  // Search can substring-match other tickets' titles/barangays too, so more
  // than one row may render — locate the anchor whose href is this exact
  // ticket's detail link rather than trusting "first visible row link".
  const link = page.locator(`a:visible[href^="/admin/tickets/${ticketId}?"], a:visible[href="/admin/tickets/${ticketId}"]`).filter({ hasText: "View ticket" });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(new RegExp(`/admin/tickets/${ticketId}(\\?.*)?$`));
  await expect(page.getByRole("link", { name: "Back to ticket queue" })).toBeVisible();

  await page.getByRole("link", { name: "Back to ticket queue" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets(\?.*)?$/);
  const queueHeading = page.getByRole("heading", { name: "Ticket Queue" });
  await settleAdminPage(page, queueHeading);
  await expect(queueHeading).toBeVisible();
});

// --- 5. Ticket Detail read-only surface --------------------------------------

test("Ticket Detail shows status, office, urgency, evidence, and location sections", async ({ page }) => {
  const ticketId = sharedReadOnlyTicketId;

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);

  // Status tracker + assigned office.
  await expect(page.getByText(/^#\d+ ·/)).toBeVisible();
  await expect(page.getByLabel("Assigned office", { exact: true })).toBeVisible();

  // Urgency info (badge in the header + scoring tab).
  await expect(page.getByText(/^Hazard Urgency \d/)).toBeVisible();
  await expect(page.getByText("Hazard Urgency", { exact: true })).toBeVisible();

  // Evidence / reports section.
  await expect(page.getByText(/^Evidence & reports \(\d+\)$/)).toBeVisible();

  // Location section.
  await expect(page.getByText("Location", { exact: true })).toBeVisible();
});

test("Ticket Detail shows the dispute section only when the ticket is disputed", async ({ page, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "dispute-section");
  const { reportId, ticketId } = await createThrowawayReport(citizenPage, `${Date.now()}`);

  await loginAs(page, E2E_SYSTEM_ADMIN);
  // Reported -> Under Review -> In Progress -> Resolved, then the citizen
  // disputes it — deterministically produces a disputed ticket instead of
  // depending on one already existing (and not yet consumed) in seed data.
  for (let i = 0; i < 3; i++) {
    const res = await page.request.post(`/api/admin/tickets/${ticketId}/status`, { multipart: { notes: "e2e" } });
    expect(res.ok()).toBe(true);
  }
  const disputeRes = await citizenPage.request.post(`/api/reports/mine/${reportId}/dispute`, {
    data: { reason: "Still broken for the e2e dispute-section check." },
  });
  expect(disputeRes.ok()).toBe(true);
  await citizenContext.close();

  await page.goto(`/admin/tickets/${ticketId}`);
  await expect(page.getByText("Citizen reports issue not fixed")).toBeVisible();
});

// --- 6. Ticket status advancement --------------------------------------------

test("advancing a ticket's status from the queue-linked detail page updates the status tracker", async ({ page, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "status");
  const { ticketId } = await createThrowawayReport(citizenPage, `${Date.now()}`);
  await citizenContext.close();

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);

  // The status pill sits in the same header row as the ticket title.
  const headerRow = page.locator("h1").locator("..");
  await expect(headerRow.getByText("Reported", { exact: true })).toBeVisible();
  const advanceButton = page.getByRole("button", { name: "Advance to Under Review" });
  await expect(advanceButton).toBeVisible();

  await advanceButton.click();

  await expect(headerRow.getByText("Under Review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advance to In Progress" })).toBeVisible();
});

// --- 7. Office reassignment ---------------------------------------------------

test("system admin can reassign a ticket's office through the UI, and office scoping still holds after restoring it", async ({ page, request, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "reassign");
  const { ticketId } = await createThrowawayReport(citizenPage, `${Date.now()}`);
  await citizenContext.close();

  await loginAs(page, E2E_SYSTEM_ADMIN);
  const sysCookies = await page.context().cookies();
  const sysHeaders = { ...sessionCookieHeader(sysCookies), "content-type": "application/json" };

  try {
    await page.goto(`/admin/tickets/${ticketId}`);
    await expect(page.getByText(/· MEO ·/)).toBeVisible();

    await page.getByLabel("Assigned office", { exact: true }).click();
    await page.getByRole("option", { name: "MDRRMO", exact: true }).click();
    await page.getByRole("button", { name: "Reassign" }).click();
    await expect(page.getByText(/· MDRRMO ·/)).toBeVisible();
  } finally {
    // Restore regardless of assertion outcome — this is a shared seeded
    // ticket, and reassignment (unlike status advancement) has a real
    // revert endpoint, so there's no reason to leave it mutated.
    await request.post(`/api/admin/tickets/${ticketId}/reassign`, {
      headers: sysHeaders,
      data: { toOffice: "MEO" },
    });
  }

  // Confirm the restore actually took (system_admin's own unscoped query,
  // by explicit office) and that a real MEO session still only sees its own
  // office afterwards — a MEO session's own "MDRRMO" query is clamped to
  // MEO by resolveOfficeScope (Phase 1 coverage), so it can't be used here
  // to prove the ticket left MDRRMO; that has to be checked as system_admin.
  const sysMeoRes = await request.get("/api/admin/tickets?office=MEO&status=all&limit=50", { headers: sysHeaders });
  const sysMeoBody = await sysMeoRes.json();
  expect(sysMeoBody.tickets.some((t: { id: number }) => t.id === ticketId)).toBe(true);

  const sysMdrrmoRes = await request.get("/api/admin/tickets?office=MDRRMO&status=all&limit=50", { headers: sysHeaders });
  const sysMdrrmoBody = await sysMdrrmoRes.json();
  expect(sysMdrrmoBody.tickets.some((t: { id: number }) => t.id === ticketId)).toBe(false);

  const meoContext = await browser.newContext();
  const meoPage = await meoContext.newPage();
  await loginAs(meoPage, E2E_MEO_ADMIN);
  const meoCookies = await meoContext.cookies();
  const meoRes = await request.get("/api/admin/tickets?office=MEO&status=all&limit=50", { headers: sessionCookieHeader(meoCookies) });
  const meoBody = await meoRes.json();
  expect(meoBody.tickets.some((t: { id: number }) => t.id === ticketId)).toBe(true);
  await meoContext.close();
});

// Reassignment is NOT system-admin-only: TicketsController.reassign sits
// behind AdminSessionGuard alone, and TicketsService.reassignOffice checks
// assertOfficeAccess against the ticket's CURRENT office, not role — so any
// office admin who has a ticket can hand it to the other office. It's a
// one-way move (the origin office loses access afterwards). This is
// documented intended behavior (docs/user-flows.md §2.6/§4.2), not a gap to
// close — these four tests pin it down rather than restrict it, sharing one
// disposable ticket across all four via describe.serial since each test
// depends on the previous one's mutation.
test.describe.serial("MEO-initiated reassignment security", () => {
  let ticketId: number;

  test.beforeAll(async ({ browser }) => {
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    await signupCitizen(citizenPage, "reassign-sec");
    ({ ticketId } = await createThrowawayReport(citizenPage, `${Date.now()}`));
    await citizenContext.close();
  });

  test("MEO admin reassigns their own MEO ticket to MDRRMO", async ({ page, request }) => {
    await loginAs(page, E2E_MEO_ADMIN);
    const headers = { ...sessionCookieHeader(await page.context().cookies()), "content-type": "application/json" };

    const res = await request.post(`/api/admin/tickets/${ticketId}/reassign`, { headers, data: { toOffice: "MDRRMO" } });
    expect(res.ok()).toBe(true);
    expect((await res.json()).assignedOffice).toBe("MDRRMO");
  });

  test("after reassignment, the original MEO session is locked out of the ticket", async ({ page, request }) => {
    await loginAs(page, E2E_MEO_ADMIN);
    const headers = sessionCookieHeader(await page.context().cookies());

    const detailRes = await request.get(`/api/admin/tickets/${ticketId}`, { headers });
    expect(detailRes.status()).toBe(403);

    const listRes = await request.get("/api/admin/tickets?office=MEO&status=all&limit=50", { headers });
    const listBody = await listRes.json();
    expect(listBody.tickets.some((t: { id: number }) => t.id === ticketId)).toBe(false);
  });

  test("MEO admin cannot reassign a ticket that is now MDRRMO's", async ({ page, request }) => {
    await loginAs(page, E2E_MEO_ADMIN);
    const headers = { ...sessionCookieHeader(await page.context().cookies()), "content-type": "application/json" };

    // Attempted direction doesn't matter — assertOfficeAccess rejects on the
    // ticket's current office (MDRRMO) before the target office is considered.
    const res = await request.post(`/api/admin/tickets/${ticketId}/reassign`, { headers, data: { toOffice: "MEO" } });
    expect(res.status()).toBe(403);
  });

  test("the reassignment left correct office_reassignments and admin_audit_events rows", async ({ page, request }) => {
    await loginAs(page, E2E_SYSTEM_ADMIN);
    const headers = sessionCookieHeader(await page.context().cookies());

    const detail = await (await request.get(`/api/admin/tickets/${ticketId}`, { headers })).json();
    const reassignment = detail.reassignments.find(
      (r: { from_office: string; to_office: string }) => r.from_office === "MEO" && r.to_office === "MDRRMO",
    );
    expect(reassignment).toBeTruthy();
    expect(reassignment.admin_name).toBe(`${E2E_MEO_ADMIN.firstName} ${E2E_MEO_ADMIN.lastName}`);

    const directory = await (await request.get("/api/admin/admins/directory?office=MEO", { headers })).json();
    const meoAdmin = directory.find((a: { email: string }) => a.email === E2E_MEO_ADMIN.email);
    expect(meoAdmin).toBeTruthy();

    const audit = await (
      await request.get("/api/admin/activity-log?actionType=ticket_reassigned&targetType=ticket&limit=25", { headers })
    ).json();
    const event = audit.events.find((e: { target_id: number }) => e.target_id === ticketId);
    expect(event).toBeTruthy();
    expect(event.actor_admin_id).toBe(meoAdmin.id);
    expect(event.metadata).toMatchObject({ from: "MEO", to: "MDRRMO" });
  });
});

// --- 8. Category and barangay filters -----------------------------------------

test("category filter narrows the queue to only that category", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/tickets?office=MEO&status=all&limit=1", { headers: sessionCookieHeader(cookies) });
  const body = await res.json();
  test.skip(body.tickets.length === 0, "no MEO tickets seeded — run `pnpm --prefix api seed:diverse-reports` first");
  const targetCategory = body.tickets[0].category as string;

  // Filter directly via URL rather than the category dropdown — the
  // dropdown only renders current (non-legacy) categories as clickable
  // options (Phase 3 category follow-up), but the underlying filter must
  // still accept a legacy category value reached via a bookmarked/shared
  // link (ALL_TICKET_CATEGORIES whitelist), and most seeded fixture data
  // still carries legacy category strings.
  await page.goto(`/admin/tickets?status=all&category=${encodeURIComponent(targetCategory)}`);
  await page.waitForLoadState("networkidle");

  const rows = page.getByRole("row").filter({ hasText: "View ticket" });
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i)).toContainText(targetCategory);
  }
});

test("barangay filter narrows the queue to only that barangay", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/tickets?office=MEO&status=all&limit=1", { headers: sessionCookieHeader(cookies) });
  const body = await res.json();
  test.skip(body.tickets.length === 0, "no MEO tickets seeded — run `pnpm --prefix api seed:diverse-reports` first");
  const targetBarangay = body.tickets[0].barangay_name as string;

  await page.goto("/admin/tickets?status=all");
  await page.waitForLoadState("networkidle");
  const filtered = page.waitForResponse((r) => r.url().includes("/api/admin/tickets?") && r.url().includes("barangayId="));
  await page.getByLabel("Barangay", { exact: true }).click();
  await page.getByRole("option", { name: targetBarangay, exact: true }).click();
  await filtered;

  const rows = page.getByRole("row").filter({ hasText: "View ticket" });
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i)).toContainText(targetBarangay);
  }
});

// --- 9. Pagination and sorting -------------------------------------------------

test("pagination advances to the next page of results when enough tickets exist", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/tickets?office=all&status=all&limit=10&page=1", { headers: sessionCookieHeader(cookies) });
  const body = await res.json();
  test.skip(body.total <= 10, "fewer than 11 seeded tickets citywide — pagination has nothing to page through");

  await page.goto("/admin/tickets?status=all&limit=10&page=1");
  await page.waitForLoadState("networkidle");
  const firstPageFirstRow = await page.getByRole("row").filter({ hasText: "View ticket" }).first().innerText();

  await page.getByRole("link", { name: "Go to next page" }).click();
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  await page.waitForLoadState("networkidle");
  const secondPageFirstRow = await page.getByRole("row").filter({ hasText: "View ticket" }).first().innerText();
  expect(secondPageFirstRow).not.toBe(firstPageFirstRow);
});

test("sort control reorders tickets by urgency", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all&limit=50");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Sort tickets", { exact: true }).click();
  await page.getByRole("option", { name: "Urgency: lowest first" }).click();
  await expect(page).toHaveURL(/[?&]sort=priority_asc(&|$)/);
  await page.waitForLoadState("networkidle");

  const scores = await page.getByRole("row").filter({ hasText: "View ticket" }).evaluateAll((rows) =>
    rows
      .map((row) => row.querySelector("td:nth-child(5)")?.textContent?.trim())
      .filter((v): v is string => !!v && v !== "—")
      .map(Number),
  );
  test.skip(scores.length < 2, "not enough scored tickets to assert an order");
  const sorted = [...scores].sort((a, b) => a - b);
  expect(scores).toEqual(sorted);
});

// --- 10. Mobile ticket queue rendering -----------------------------------------

test("mobile viewport renders the ticket queue card list, not the desktop table, and a card link works", async ({ page }) => {
  const ticketId = sharedReadOnlyTicketId;

  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, E2E_MEO_ADMIN);
  // Search-filtered to this disposable ticket — guarantees exactly one
  // matching card instead of depending on however many tickets happen to
  // exist citywide at this point in a full-suite run.
  await page.goto(`/admin/tickets?status=all&search=${ticketId}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();

  // Search can substring-match other tickets' titles/barangays too, so more
  // than one card may render — locate the anchor whose href is this exact
  // ticket's detail link rather than trusting "first visible card link".
  const cardLink = page.locator(`a:visible[href^="/admin/tickets/${ticketId}?"], a:visible[href="/admin/tickets/${ticketId}"]`).filter({ hasText: "View ticket" });
  await expect(cardLink).toBeVisible();
  await cardLink.click();
  await expect(page).toHaveURL(new RegExp(`/admin/tickets/${ticketId}(\\?.*)?$`));
});

// --- 11. Admin resolution flow + citizen Case Closure Summary integration ----

// citizen-dispute.spec.ts's own "Case Closure Summary" tests already cover
// notes/photo/confirm/dispute permutations thoroughly, but always resolve
// via a direct API call to /status — never by actually driving
// HorizontalStatusTracker's UI (the plain-POST intermediate steps, then the
// ResolveDialog's file input + notes textarea for the final one). These two
// tests share one disposable ticket (module state, safe under this file's
// mandatory --workers=1 — see admin-work-orders.spec.ts's borrowedTicket for
// the same pattern) so the second test can verify the citizen-facing page
// reflects exactly what the first test resolved through the real dialog,
// without re-creating and re-resolving a second ticket just to look at it
// from the other side.
let resolvedFixture: { reportId: number; ticketId: number; citizen: { email: string; password: string } } | null = null;
const RESOLUTION_NOTES = "Pothole patched and repaved by field crew.";

test("resolving a ticket through the admin UI records notes, photo, and updates the status tracker", async ({ page, browser }) => {
  // Citizen signup + report submission + 3 real status round trips
  // (including a live Cloudinary image upload) comfortably exceed the
  // file's default 60s budget under load.
  test.setTimeout(90_000);
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  const citizen = await signupCitizen(citizenPage, "resolve");
  const { reportId, ticketId } = await createThrowawayReport(citizenPage, `${Date.now()}`);
  await citizenContext.close();
  resolvedFixture = { reportId, ticketId, citizen };

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);

  // Reported -> Under Review -> In Progress via the tracker's plain advance
  // button (no dialog for these two steps).
  await page.getByRole("button", { name: "Advance to Under Review" }).click();
  await expect(page.getByRole("button", { name: "Advance to In Progress" })).toBeVisible();
  await page.getByRole("button", { name: "Advance to In Progress" }).click();
  await expect(page.getByRole("button", { name: "Advance to Resolved" })).toBeVisible();

  // In Progress -> Resolved opens the resolve dialog instead of advancing
  // directly.
  await page.getByRole("button", { name: "Advance to Resolved" }).click();
  const dialog = page.getByRole("dialog", { name: "Mark ticket resolved" });
  await expect(dialog).toBeVisible();
  await dialog.locator("#resolve-photo").setInputFiles({
    name: "01_poblacion.jpg",
    mimeType: "image/jpeg",
    buffer: readFileSync("public/uploads/reports/01_poblacion.jpg"),
  });
  await dialog.getByLabel("Completion notes").fill(RESOLUTION_NOTES);
  const resolveButton = dialog.getByRole("button", { name: "Mark resolved" });
  await resolveButton.scrollIntoViewIfNeeded();
  await resolveButton.click();
  // MediaService.uploadImage is a real Cloudinary round trip, not a mock —
  // slower and more variable than the plain-POST intermediate steps above,
  // so this one assertion gets a longer timeout rather than bumping every
  // wait in the file.
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });

  // Status pill in the header row updates to Resolved.
  const headerRow = page.locator("h1").locator("..");
  await expect(headerRow.getByText("Resolved", { exact: true })).toBeVisible();
  // Tracker itself shows no further transition available.
  await expect(page.getByText("No further status transition.")).toBeVisible();
  // Before & after resolution card only renders once resolution_image_url
  // is set — proves the photo upload actually persisted, not just the form
  // closing successfully.
  await expect(page.getByText("Before & after resolution")).toBeVisible();
  await expect(page.getByText(RESOLUTION_NOTES)).toBeVisible();
});

test("the citizen's Case Closure Summary reflects a ticket resolved through the admin UI", async ({ page }) => {
  test.skip(!resolvedFixture, "requires the preceding admin-UI resolution test to have run and populated a fixture");
  const { reportId, citizen } = resolvedFixture!;

  await loginCitizen(page, citizen);
  await page.goto(`/dashboard/reports/${reportId}`);
  const summaryHeading = page.getByRole("heading", { name: "Case Closure Summary" });
  await expect(summaryHeading).toBeVisible();

  // CaseClosureSummary's own root card is three levels up from its heading
  // (heading -> title-wrapper div -> header-row div -> card div) — scoping
  // here, rather than to the page as a whole, avoids a strict-mode collision
  // with the Timeline card's "Latest Update" banner, which surfaces the same
  // resolution_notes text as a sibling section on the same page.
  const summaryCard = summaryHeading.locator("../../..");
  await expect(summaryCard.getByText(RESOLUTION_NOTES)).toBeVisible();
  await expect(page.getByAltText("Photo taken by staff confirming the resolution")).toBeVisible();

  // Neither confirm nor dispute has happened yet for this fresh fixture, so
  // both feedback actions must still be offered.
  await expect(page.getByRole("button", { name: "Confirm Fixed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report Still Not Fixed" })).toBeVisible();
});

// --- 8. Referral (Phase 3 manuscript alignment) --------------------------------

// "Leaking Pipe / Water Supply Concern" is a Referral-classified category
// that still routes to MEO custody (api/src/common/utils/office.ts) — same
// reasoning as Pothole above, but exercises the non-direct-responsibility
// path instead.
async function createReferralReport(citizenPage: Page, titleSuffix: string): Promise<{ ticketId: number }> {
  const jitter = () => (Math.random() - 0.5) * 0.01;
  const res = await citizenPage.request.post("/api/reports", {
    multipart: {
      title: `E2E referral ${titleSuffix}`,
      category: "Leaking Pipe / Water Supply Concern",
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
  if (!res.ok()) {
    const bodyText = await res.text().catch((e) => `<failed to read body: ${e}>`);
    throw new Error(`createReferralReport: POST /api/reports failed — status ${res.status()} ${res.statusText()}\nbody: ${bodyText}`);
  }
  return (await res.json()) as { ticketId: number };
}

test("a Referral-classified ticket shows the badge and Log Referral action; a Direct-responsibility ticket shows neither", async ({ page, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "referral");
  const { ticketId: referralTicketId } = await createReferralReport(citizenPage, `${Date.now()}`);
  await citizenContext.close();

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${referralTicketId}`);
  await expect(page.getByText("Referral — coordinate externally", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Referral agency", { exact: true })).toBeVisible();

  // A Direct-responsibility ticket (Pothole) shows neither.
  await page.goto(`/admin/tickets/${sharedReadOnlyTicketId}`);
  await expect(page.getByText("Referral — coordinate externally", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Referral agency", { exact: true })).toHaveCount(0);
});

test("logging a referral persists and appears in the ticket timeline", async ({ page, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "referral-log");
  const { ticketId } = await createReferralReport(citizenPage, `${Date.now()}`);
  await citizenContext.close();

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);

  await page.getByLabel("Referral agency", { exact: true }).click();
  await page.getByRole("option", { name: "MENRO", exact: true }).click();
  await page.getByLabel("Referral note", { exact: true }).fill("E2E referral note");
  await page.getByRole("button", { name: "Log Referral" }).click();

  await expect(page.getByRole("button", { name: "Recording..." })).toHaveCount(0);
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText(/Referral recorded — MENRO: E2E referral note/)).toBeVisible();
});

// --- 9. Reject (Phase 4 workflow completeness) --------------------------------

test("rejecting a fresh ticket sets it to Rejected, shows the status tracker's rejected state, and hides the reject action afterward", async ({ page, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "reject");
  const { ticketId } = await createThrowawayReport(citizenPage, `${Date.now()}`);
  await citizenContext.close();

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);

  await expect(page.getByRole("button", { name: "Reject Ticket" })).toBeDisabled();
  await page.getByLabel("Rejection reason", { exact: true }).fill("Outside city limits.");
  await page.getByRole("button", { name: "Reject Ticket" }).click();

  await expect(page.getByRole("button", { name: "Rejecting..." })).toHaveCount(0);
  await expect(page.getByText("This ticket was rejected.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Rejection reason", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject Ticket" })).toHaveCount(0);
});
