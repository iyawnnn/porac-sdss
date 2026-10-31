
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { E2E_FOCAL_ADMIN, E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs, loginCitizen, settleAdminPage } from "./helpers";

test.setTimeout(60_000);

// The Ticket Queue's table is a CSS grid, not a <table> (docs/design-system.md
// §5.8), and its rows no longer carry a "View ticket" button — the row's own
// data attribute is the stable handle. Every row assertion in this file goes
// through this rather than re-deriving a locator per test.
function queueRows(page: Page) {
  return page.locator("[data-ticket-row]");
}

// The seven filters live behind a Filters popover now. Opening it is a
// precondition for touching any of them, so it is one helper rather than a
// click repeated in every filter test.
async function openQueueFilters(page: Page) {
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

// The row link is an icon button labelled by the ticket it opens.
function openTicketLink(page: Page, ticketId: number) {
  return page.getByRole("link", { name: `Open ticket ${ticketId}`, exact: true });
}

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
async function createThrowawayReport(citizenPage: Page, titleSuffix: string): Promise<{ reportId: number; ticketId: number; trackingReference: string; title: string }> {
  // The jitter here (~±550m) mirrors citizen-dispute.spec.ts's own jitter().
  // It used to keep this report clear of the automatic dedup merge radius;
  // since manuscript revision Phase 1, step 3 every report creates its own
  // ticket, so it is now only defensive.
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
  const body = (await res.json()) as { reportId: number; ticketId: number; trackingReference: string };
  return { ...body, title };
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
// Its title ends in a millisecond timestamp, so searching the queue by it
// matches this ticket alone. Searching by the numeric id also substring-
// matches every older E2E title whose timestamp contains those digits (16
// tickets for id 240), which can push this newer, lower-priority ticket off
// page 1.
let sharedReadOnlyTitle: string;

test.beforeAll(async ({ browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "shared-readonly");
  ({ ticketId: sharedReadOnlyTicketId, title: sharedReadOnlyTitle } = await createThrowawayReport(citizenPage, `shared-readonly-${Date.now()}`));
  await citizenContext.close();
});

// --- 1. Ticket Queue baseline ---------------------------------------------

test("authenticated admin can open the Ticket Queue and see its content", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets");
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  // Either seeded rows or the documented empty state must render — never a
  // blank/broken page.
  const hasRows = (await queueRows(page).count()) > 0;
  if (hasRows) {
    await expect(queueRows(page).first()).toBeVisible();
  } else {
    await expect(page.getByText("No tickets match this filter.")).toBeVisible();
  }
});

// --- 2. Ticket Queue filters -----------------------------------------------

test("status filter changes the visible ticket set", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all");
  await page.waitForLoadState("networkidle");

  await openQueueFilters(page);
  await page.getByLabel("Status", { exact: true }).click();
  await page.getByRole("option", { name: "Resolved", exact: true }).click();
  await expect(page).toHaveURL(/[?&]status=Resolved(&|$)/);
  await page.waitForLoadState("networkidle");

  const rows = queueRows(page);
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
  const rows = queueRows(page);
  await expect(rows.first()).toBeVisible();
  await expect(page.getByText(`#${target.id}`, { exact: true })).toBeVisible();
});

test("disputed-only filter shows only disputed tickets or the empty state", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all");
  await page.waitForLoadState("networkidle");

  await openQueueFilters(page);
  await page.getByRole("button", { name: "Disputed only" }).click();
  await expect(page).toHaveURL(/[?&]disputed=true(&|$)/);
  await page.keyboard.press("Escape");
  await page.waitForLoadState("networkidle");

  const rows = queueRows(page);
  const count = await rows.count();
  if (count === 0) {
    await expect(page.getByText("No tickets match this filter.")).toBeVisible();
  } else {
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).getByText("Disputed", { exact: true })).toBeVisible();
    }
  }
});

// Manuscript revision Phase 2, step 2a (handoff Decision 13): only old
// combined drainage tickets carry the flag (set by migration 0035), so a
// database without any shows the empty state instead.
test("needs-category-review filter shows only review-flagged tickets or the empty state", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all");
  await page.waitForLoadState("networkidle");

  await openQueueFilters(page);
  await page.getByRole("button", { name: "Needs category review" }).click();
  await expect(page).toHaveURL(/[?&]categoryReview=true(&|$)/);
  await page.keyboard.press("Escape");
  await page.waitForLoadState("networkidle");

  const rows = queueRows(page);
  const count = await rows.count();
  if (count === 0) {
    await expect(page.getByText("No tickets match this filter.")).toBeVisible();
  } else {
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).getByText("Category review", { exact: true })).toBeVisible();
    }
  }
});

test("reset filters clears status, search, and disputed back to defaults", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all&search=zzz&disputed=true");
  await page.waitForLoadState("networkidle");

  // Active filters surface as dismissable chips with a "Clear all" beside
  // them; the old always-present "Reset filters" button is gone.
  await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();

  await expect(page).not.toHaveURL(/disputed=true/);
  await expect(page).not.toHaveURL(/search=zzz/);
  await expect(page.getByRole("button", { name: "Clear all" })).toHaveCount(0);
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

// Batch 6 (five-role E2E reconciliation): the Ticket Queue's office picker/
// city-wide view was system_admin-only. Batch 1 of the five-role
// architecture removed system_admin's operational access entirely
// (confirmed live in Batch 5: /admin/tickets renders "Ticket Queue
// Unavailable" for it), so there is no reachable office picker left to test
// for any role — office admins never had one (their own office is
// implicit).
test("system admin cannot reach the Ticket Queue at all", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/tickets");
  await expect(page.getByText("Ticket Queue Unavailable")).toBeVisible();
  await expect(page.getByLabel("Office", { exact: true })).toHaveCount(0);
});

// --- 4. Queue to Detail navigation ------------------------------------------

test("clicking a ticket from the queue opens its detail page and back link returns to the queue", async ({ page }) => {
  const ticketId = sharedReadOnlyTicketId;

  await loginAs(page, E2E_MEO_ADMIN);
  // Search-filtered to this disposable ticket specifically (by its unique
  // title, see sharedReadOnlyTitle) — the queue's default order isn't
  // stable across a full-suite run (other specs create, resolve, and
  // reassign tickets), so "first row" isn't guaranteed to be this ticket
  // even though it always exists.
  await page.goto(`/admin/tickets?status=all&search=${encodeURIComponent(sharedReadOnlyTitle)}`);
  await page.waitForLoadState("networkidle");

  // Search can substring-match other tickets' titles/barangays too, so more
  // than one row may render — locate the anchor whose href is this exact
  // ticket's detail link rather than trusting "first visible row link".
  const link = openTicketLink(page, ticketId);
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

test("Ticket Detail shows status, office, Operational Priority, evidence, and location sections", async ({ page }) => {
  const ticketId = sharedReadOnlyTicketId;

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);

  // Status tracker + assigned office.
  await expect(page.getByText(/^#\d+ ·/)).toBeVisible();
  // Since manuscript revision Phase 5, step 5a the Assignment card shows the
  // responsible office, with Reassign as a dialog behind a button.
  await expect(page.getByText(/^Responsible office: (MEO|MDRRMO)$/)).toBeVisible();

  // Operational Priority (header badge + scoring tab). Hazard Urgency was
  // retired from this page in manuscript revision Phase 1, step 5 — no
  // urgency card, no factor bars, no live rain line.
  await expect(page.getByText(/^Operational Priority (\d+|—) · (Low|Medium|High|—)$/)).toBeVisible();
  await expect(page.getByText("Operational Priority (how soon to act)", { exact: true })).toBeVisible();
  await expect(page.getByText(/Hazard Urgency/)).toHaveCount(0);
  await expect(page.getByText(/rain rate/i)).toHaveCount(0);

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

  // The ticket's own office advances it. This used to log in as the system
  // admin, but Batch 1 of the five-role architecture denies system_admin on
  // every ticket route (OperationalStaffGuard), so the status POSTs below
  // were 403s. "Pothole / Road Surface Damage" routes to MEO.
  await loginAs(page, E2E_MEO_ADMIN);
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

// Batch 6 (five-role E2E reconciliation): this used to reassign via
// system_admin's unscoped access, then verify the restore with system_admin's
// own "unscoped by explicit office" query — both of which Batch 1 of the
// five-role architecture removed entirely (OperationalStaffGuard denies
// system_admin on every ticket route now). The real value here — clicking
// the actual Assignment panel UI control, not just hitting the reassign API
// directly — is preserved by switching to the ticket's owning office at
// each step: MEO does the UI reassignment, MDRRMO (the new owner) restores
// it in the `finally`, and each office's own session verifies its own
// office-scoped list afterward (neither can do an "unscoped" check anymore,
// but own-office membership before/after is exactly what proves the
// mechanic and the restore both worked).
test("MEO admin can reassign a ticket's office through the UI, and office scoping still holds after restoring it", async ({ page, request, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "reassign");
  const { ticketId, title } = await createThrowawayReport(citizenPage, `${Date.now()}`);
  await citizenContext.close();

  await loginAs(page, E2E_MEO_ADMIN);

  try {
    await page.goto(`/admin/tickets/${ticketId}`);
    await expect(page.getByText(/· MEO ·/)).toBeVisible();

    // Reassign is a dialog with a required reason since manuscript revision
    // Phase 5, step 5a.
    await page.getByRole("button", { name: "Reassign", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason (required)").fill("E2E: reassignment through the UI.");
    const reassigned = page.waitForResponse(
      (r) => r.url().includes(`/api/admin/tickets/${ticketId}/reassign`) && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Reassign to MDRRMO" }).click();
    expect((await reassigned).ok()).toBe(true);
    await expect(dialog.getByRole("heading", { name: `Ticket #${ticketId} reassigned to MDRRMO` })).toBeVisible();

    // Once the ticket is MDRRMO's, the MEO session can no longer open it
    // (assertOfficeAccess — the lock-out itself is covered by the
    // "original MEO session is locked out" test below), so the new owner
    // confirms the move from its own session instead of waiting for MEO's
    // refreshed page to show text it is no longer allowed to read.
    const mdrrmoCheckContext = await browser.newContext();
    const mdrrmoCheckPage = await mdrrmoCheckContext.newPage();
    await loginAs(mdrrmoCheckPage, E2E_MDRRMO_ADMIN);
    await mdrrmoCheckPage.goto(`/admin/tickets/${ticketId}`);
    await expect(mdrrmoCheckPage.getByText(/· MDRRMO ·/)).toBeVisible();
    await mdrrmoCheckContext.close();
  } finally {
    // Restore regardless of assertion outcome — this is a shared seeded
    // ticket, and reassignment (unlike status advancement) has a real
    // revert endpoint, so there's no reason to leave it mutated. The ticket
    // is MDRRMO's by this point, so only an MDRRMO session has authority to
    // move it back.
    const mdrrmoContext = await browser.newContext();
    const mdrrmoPage = await mdrrmoContext.newPage();
    await loginAs(mdrrmoPage, E2E_MDRRMO_ADMIN);
    const mdrrmoHeaders = { ...sessionCookieHeader(await mdrrmoContext.cookies()), "content-type": "application/json" };
    const restoreRes = await request.post(`/api/admin/tickets/${ticketId}/reassign`, {
      headers: mdrrmoHeaders,
      data: { toOffice: "MEO", reason: "E2E cleanup: restoring the original office." },
    });
    expect(restoreRes.ok()).toBe(true);
    await mdrrmoContext.close();
  }

  // Confirm the restore actually took: MEO's own list has it back, MDRRMO's
  // own list no longer does. Both lists are searched by this report's full
  // title, whose timestamp suffix matches only this ticket, rather than by
  // its id or read as "the first rows": a numeric search also matches every
  // report title containing those digits (other runs' timestamped titles),
  // the list returns 15 rows per page, and a fresh Low-severity throwaway
  // ranks near the bottom of the Operational Priority order, so it can fall
  // off page one even when the restore worked. (The title, not the bare
  // timestamp: an all-digit term is also compared with t.id as an integer.)
  const search = encodeURIComponent(title);
  const meoCookies = await page.context().cookies();
  const meoRes = await request.get(`/api/admin/tickets?status=all&search=${search}`, { headers: sessionCookieHeader(meoCookies) });
  const meoBody = await meoRes.json();
  expect(meoBody.tickets.some((t: { id: number }) => t.id === ticketId)).toBe(true);

  const mdrrmoContext = await browser.newContext();
  const mdrrmoPage = await mdrrmoContext.newPage();
  await loginAs(mdrrmoPage, E2E_MDRRMO_ADMIN);
  const mdrrmoRes = await request.get(`/api/admin/tickets?status=all&search=${search}`, { headers: sessionCookieHeader(await mdrrmoContext.cookies()) });
  const mdrrmoBody = await mdrrmoRes.json();
  expect(mdrrmoBody.tickets.some((t: { id: number }) => t.id === ticketId)).toBe(false);
  await mdrrmoContext.close();
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

    const res = await request.post(`/api/admin/tickets/${ticketId}/reassign`, {
      headers,
      data: { toOffice: "MDRRMO", reason: "E2E: reassignment security check." },
    });
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
    const res = await request.post(`/api/admin/tickets/${ticketId}/reassign`, {
      headers,
      data: { toOffice: "MEO", reason: "E2E: not this office's ticket." },
    });
    expect(res.status()).toBe(403);
  });

  // Batch 6: fetching ticket detail and the MEO directory used to go
  // through system_admin's unscoped access, removed entirely by Batch 1.
  // The ticket is MDRRMO's by this point in the serial block, so its own
  // detail is only reachable via an MDRRMO session; the MEO admin lookup
  // needs an MEO session specifically (resolveOfficeScope clamps any
  // operational admin's ?office= to their own, so MDRRMO can never list
  // MEO's directory). The Activity Log check is genuinely system_admin-only
  // (SystemAdminGuard, untouched by the five-role work) and stays that way.
  test("the reassignment left correct office_reassignments and admin_audit_events rows", async ({ page, request }) => {
    await loginAs(page, E2E_MDRRMO_ADMIN);
    const mdrrmoHeaders = sessionCookieHeader(await page.context().cookies());

    const detail = await (await request.get(`/api/admin/tickets/${ticketId}`, { headers: mdrrmoHeaders })).json();
    const reassignment = detail.reassignments.find(
      (r: { from_office: string; to_office: string }) => r.from_office === "MEO" && r.to_office === "MDRRMO",
    );
    expect(reassignment).toBeTruthy();
    expect(reassignment.admin_name).toBe(`${E2E_MEO_ADMIN.firstName} ${E2E_MEO_ADMIN.lastName}`);
    expect(reassignment.reason).toBe("E2E: reassignment security check.");

    await page.context().clearCookies();
    await loginAs(page, E2E_MEO_ADMIN);
    const meoHeaders = sessionCookieHeader(await page.context().cookies());
    const directory = await (await request.get("/api/admin/admins/directory?office=MEO", { headers: meoHeaders })).json();
    const meoAdmin = directory.find((a: { email: string }) => a.email === E2E_MEO_ADMIN.email);
    expect(meoAdmin).toBeTruthy();

    await page.context().clearCookies();
    await loginAs(page, E2E_SYSTEM_ADMIN);
    const sysHeaders = sessionCookieHeader(await page.context().cookies());
    const audit = await (
      await request.get("/api/admin/activity-log?actionType=ticket_reassigned&targetType=ticket&limit=25", { headers: sysHeaders })
    ).json();
    const event = audit.events.find((e: { target_id: number }) => e.target_id === ticketId);
    expect(event).toBeTruthy();
    expect(event.actor_admin_id).toBe(meoAdmin.id);
    expect(event.metadata).toMatchObject({ from: "MEO", to: "MDRRMO", reason: "E2E: reassignment security check." });
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

  const rows = queueRows(page);
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
  await openQueueFilters(page);
  await page.getByLabel("Barangay", { exact: true }).click();
  await page.getByRole("option", { name: targetBarangay, exact: true }).click();
  await filtered;
  await page.keyboard.press("Escape");

  const rows = queueRows(page);
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i)).toContainText(targetBarangay);
  }
});

// Manuscript revision Phase 1, step 4: the Hazard Urgency filter and sorts are
// retired. An old bookmark that still carries them must open the normal
// Operational Priority queue — no urgency chip, no urgency control, and the
// retired keys are not echoed back into the URL or the API request.
test("a retired Hazard Urgency deep link falls back to the Operational Priority queue", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);

  await page.goto("/admin/tickets?status=all&urgency=High&sort=priority_desc");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("button", { name: "Urgency: High" })).toHaveCount(0);
  await expect(page.getByText(/sorted by operational priority, highest first/)).toBeVisible();
  await expect(page.getByText("High urgency", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/urgency score/i)).toHaveCount(0);

  await openQueueFilters(page);
  await expect(page.getByLabel("Hazard Urgency", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Any refetch rebuilds the URL from parsed state, so the retired keys drop.
  await page.getByRole("button", { name: "Sort tickets" }).click();
  await expect(page.getByRole("menuitemradio", { name: /Hazard Urgency/ })).toHaveCount(0);
  const refetch = page.waitForResponse((r) => r.url().includes("/api/admin/tickets?") && r.url().includes("sort=newest"));
  await page.getByRole("menuitemradio", { name: "Newest first" }).click();
  const res = await refetch;
  expect(res.url()).not.toContain("urgency=");
  await expect(page).not.toHaveURL(/[?&]urgency=/);
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
  const firstPageFirstRow = await queueRows(page).first().innerText();

  // The pager moved inside the table card and its controls are buttons now,
  // not anchors — a page change refetches, it never navigates.
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  await page.waitForLoadState("networkidle");
  const secondPageFirstRow = await queueRows(page).first().innerText();
  expect(secondPageFirstRow).not.toBe(firstPageFirstRow);
});

test("sort control reorders tickets by Operational Priority", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=all&limit=50");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Sort tickets" }).click();
  await page.getByRole("menuitemradio", { name: "Operational Priority: Low to High" }).click();
  await expect(page).toHaveURL(/[?&]sort=op_priority_asc(&|$)/);
  await page.waitForLoadState("networkidle");

  // Read the score off the row's own data attribute rather than a cell index:
  // the queue's columns are user-hideable, so nth-child is no longer a stable
  // way to find the priority column.
  const scores = await queueRows(page).evaluateAll((rows) =>
    rows
      .map((row) => (row as HTMLElement).dataset.priorityIndex)
      .filter((v): v is string => !!v)
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
  // Search-filtered to this disposable ticket by its unique title (see
  // sharedReadOnlyTitle) — guarantees exactly one matching card instead of
  // depending on however many tickets happen to exist citywide at this
  // point in a full-suite run.
  await page.goto(`/admin/tickets?status=all&search=${encodeURIComponent(sharedReadOnlyTitle)}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();

  // Search can substring-match other tickets' titles/barangays too, so more
  // than one card may render — locate the anchor whose href is this exact
  // ticket's detail link rather than trusting "first visible card link".
  const cardLink = page.locator(`a:visible[href^="/admin/tickets/${ticketId}?"], a:visible[href="/admin/tickets/${ticketId}"]`).first();
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
  const { reportId, ticketId, trackingReference } = await createThrowawayReport(citizenPage, `${Date.now()}`);
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
  // Manuscript revision Phase 2, step 2b (Appendix H): resolving through the
  // dialog records the municipal-action outcome, and the evidence list shows
  // the report's PRC tracking reference.
  await expect(headerRow.getByText("Outcome: Municipal action completed", { exact: true })).toBeVisible();
  expect(trackingReference).toMatch(/^PRC-\d{4}-\d{6,}$/);
  // On the report card; since step 4a the Ticket severity list repeats it.
  await expect(page.getByTestId(`report-card-${reportId}`).getByText(trackingReference, { exact: true })).toBeVisible();
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
async function createReferralReport(
  citizenPage: Page,
  titleSuffix: string,
  at: { lat: number; lng: number },
): Promise<{ ticketId: number; reportId: number }> {
  const res = await citizenPage.request.post("/api/reports", {
    multipart: {
      title: `E2E referral ${titleSuffix}`,
      category: "Leaking Pipe / Water Supply Concern",
      citizen_severity: "Low",
      lat: String(at.lat),
      lng: String(at.lng),
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
  return (await res.json()) as { ticketId: number; reportId: number };
}

// Manuscript revision Phase 3, step 3c: the two referral tickets also serve
// the "Possibly related tickets" panel, so it costs no extra report (a full
// run already posts 20, the per-IP hourly limit; docs/testing.md §6). The
// second is placed 8 m north of the first, inside Leaking Pipe's 50 m radius.
// The area is a point in Jalung that had no ticket of any kind within 400 m,
// away from the Poblacion box the other fixtures use, and both tickets are
// rejected afterward, so a later run starts from an empty area. Serial: the
// later tests use the earlier tests' tickets (--workers=1).
const REFERRAL_AREA = { lat: 15.06, lng: 120.53 };
const NEARBY_OFFSET_DEG = 8 / 111_320; // 8 m north

test.describe.serial("Referral tickets and their related-ticket suggestions", () => {
  // About ±165 m, so a run whose cleanup failed doesn't sit on the next one.
  const jitter = () => (Math.random() - 0.5) * 0.003;
  const referralAt = { lat: REFERRAL_AREA.lat + jitter(), lng: REFERRAL_AREA.lng + jitter() };
  let referral: { ticketId: number; reportId: number } | undefined;
  let nearby: { ticketId: number; reportId: number } | undefined;

  test.afterAll(async ({ browser }) => {
    const ticketIds = [referral?.ticketId, nearby?.ticketId].filter((id): id is number => id !== undefined);
    if (ticketIds.length === 0) return;
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, E2E_MEO_ADMIN);
    for (const id of ticketIds) {
      await page.request.post(`/api/admin/tickets/${id}/reject`, {
        data: { reason: "E2E cleanup: related-ticket suggestion fixture." },
      });
    }
    await context.close();
  });

  test("a Referral-classified ticket shows the badge and Refer action; a Direct-responsibility ticket shows neither; alone in its area, it has no related suggestions", async ({ page, browser }) => {
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    await signupCitizen(citizenPage, "referral");
    referral = await createReferralReport(citizenPage, `${Date.now()}`, referralAt);
    await citizenContext.close();

    await loginAs(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${referral.ticketId}`);
    await expect(page.getByText("Referral — coordinate externally", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refer", exact: true })).toBeVisible();
    await expect(page.getByText("Possibly related tickets", { exact: true })).toBeVisible();
    await expect(page.getByText("Suggested by distance and category only. Staff confirm whether reports are related.")).toBeVisible();
    await expect(page.getByText("No active tickets of the same category within 50 m.", { exact: true })).toBeVisible();

    // A Direct-responsibility ticket (Pothole) shows neither.
    await page.goto(`/admin/tickets/${sharedReadOnlyTicketId}`);
    await expect(page.getByText("Referral — coordinate externally", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refer", exact: true })).toHaveCount(0);
  });

  test("logging a referral persists and appears in the ticket timeline", async ({ page, browser }) => {
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    await signupCitizen(citizenPage, "referral-log");
    nearby = await createReferralReport(citizenPage, `${Date.now()}`, {
      lat: referralAt.lat + NEARBY_OFFSET_DEG,
      lng: referralAt.lng,
    });
    await citizenContext.close();

    await loginAs(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${nearby.ticketId}`);

    // Refer is a dialog with a required reason since manuscript revision
    // Phase 5, step 5a.
    await page.getByRole("button", { name: "Refer", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Referral agency" }).click();
    await page.getByRole("option", { name: "MENRO", exact: true }).click();
    await dialog.getByLabel("Reason (required)").fill("E2E referral reason");
    await dialog.getByRole("button", { name: "Record referral" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole("tab", { name: "Timeline" }).click();
    await expect(page.getByText(/Referral recorded — MENRO: E2E referral reason/)).toBeVisible();
  });

  test("the ticket 8 m away is suggested as possibly related on Ticket Detail (MEO) and on Focal intake detail", async ({ page, browser }) => {
    const [first, second] = [referral!, nearby!];
    const label = new RegExp(`^Ticket #${second.ticketId} · (\\d+) m away$`);

    await loginAs(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${first.ticketId}`);
    const link = page.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `/admin/tickets/${second.ticketId}`);
    const metres = Number(label.exec((await link.textContent()) ?? "")?.[1]);
    expect(metres).toBeGreaterThanOrEqual(6);
    expect(metres).toBeLessThanOrEqual(10);
    await expect(page.getByText("No active tickets of the same category within 50 m.", { exact: true })).toHaveCount(0);

    // Focal works from reports: the same suggestion, linking to its intake detail.
    const focalContext = await browser.newContext();
    const focalPage = await focalContext.newPage();
    await loginAs(focalPage, E2E_FOCAL_ADMIN);
    await focalPage.goto(`/admin/focal/intake/${first.reportId}`);
    const focalLink = focalPage.getByRole("link", { name: label });
    await expect(focalLink).toBeVisible();
    await expect(focalLink).toHaveAttribute("href", `/admin/focal/intake/${second.reportId}`);
    await focalContext.close();
  });
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
