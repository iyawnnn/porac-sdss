import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin as sharedLoginAdmin } from "./helpers";

test.setTimeout(60_000);

async function loginAdmin(page: Page) {
  await sharedLoginAdmin(page, E2E_MEO_ADMIN);
}

// Each test creates its own citizen + report + resolves it, rather than
// relying on seeded data being in a particular status — resolution and
// dispute are one-way transitions, so a shared fixture would only work once
// per database (same rationale as citizen-reports.spec.ts's moderation test).
async function signupCitizen(page: Page, label: string): Promise<{ email: string; password: string }> {
  const email = `e2e-dispute-${label}-${Date.now()}@porac.ph`;
  const password = "PoracDemo2026!";
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Dispute");
  await page.getByLabel("Last name").fill(label);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  return { email, password };
}

async function submitAndResolveReport(
  citizenPage: Page,
  adminPage: Page,
  titleSuffix: string,
): Promise<{ reportId: number; ticketId: number }> {
  const jitter = () => (Math.random() - 0.5) * 0.01;
  const submitRes = await citizenPage.request.post("/api/reports", {
    multipart: {
      title: `E2E dispute check ${titleSuffix}`,
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
  expect(submitRes.ok()).toBe(true);
  const { reportId, ticketId } = (await submitRes.json()) as { reportId: number; ticketId: number };

  // Reported -> Under Review -> In Progress -> Resolved.
  for (let i = 0; i < 3; i++) {
    const res = await adminPage.request.post(`/api/admin/tickets/${ticketId}/status`, {
      multipart: { notes: "e2e" },
    });
    expect(res.ok()).toBe(true);
  }

  return { reportId, ticketId };
}

test.describe("Citizen resolution feedback", () => {
  test("dispute action appears only on a resolved report, and Confirm Fixed persists across reload", async ({ page, browser }) => {
    const citizen = await signupCitizen(page, "confirm");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage);

    const submitRes = await page.request.post("/api/reports", {
      multipart: {
        title: "E2E not-yet-resolved check",
        category: "Pothole / Road Surface Damage",
        citizen_severity: "Low",
        lat: "15.0711",
        lng: "120.5401",
        image: {
          name: "01_poblacion.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync("public/uploads/reports/01_poblacion.jpg"),
        },
      },
    });
    const { reportId: unresolvedId } = (await submitRes.json()) as { reportId: number };
    await page.goto(`/dashboard/reports/${unresolvedId}`);
    await expect(page.getByText("Resolution Feedback")).toHaveCount(0);

    const { reportId } = await submitAndResolveReport(page, adminPage, `confirm-${citizen.email}`);
    await adminContext.close();

    await page.goto(`/dashboard/reports/${reportId}`);
    await expect(page.getByText("Resolution Feedback")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm Fixed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Report Still Not Fixed" })).toBeVisible();

    await page.getByRole("button", { name: "Confirm Fixed" }).click();
    await expect(page.getByText("Thanks for confirming")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm Fixed" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Report Still Not Fixed" })).toHaveCount(0);

    // Persisted, not just client-side state — a reload must still show the
    // confirmed state and never re-show the feedback prompt.
    await page.reload();
    await expect(page.getByText("Thanks for confirming")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm Fixed" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Report Still Not Fixed" })).toHaveCount(0);
  });

  test("citizen can report still-not-fixed, sees success, and the action stays hidden after reload", async ({ page, browser }) => {
    const citizen = await signupCitizen(page, "dispute");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage);
    const { reportId, ticketId } = await submitAndResolveReport(page, adminPage, `dispute-${citizen.email}`);

    await page.goto(`/dashboard/reports/${reportId}`);
    await page.getByRole("button", { name: "Report Still Not Fixed" }).click();
    await page.getByLabel("What's still wrong?").fill("The pothole is still there.");
    await page.getByRole("button", { name: "Submit" }).click();

    // .first() since the Case Closure Summary card now also shows a short
    // recap of the same disputed state — see the "Case Closure Summary"
    // describe block below for a dedicated check of that recap text.
    await expect(page.getByText("You reported that this issue isn't actually fixed").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Report Still Not Fixed" })).toHaveCount(0);

    // Hidden after a reload too, not just client-side state.
    await page.reload();
    await expect(page.getByText("You reported that this issue isn't actually fixed").first()).toBeVisible();

    // Admin side: Ticket Queue disputed filter and Ticket Detail dispute info.
    // Disputed tickets are Resolved, which the default "Active / Open"
    // status filter excludes — switch to "All statuses" first so the
    // disputed-only toggle has something to show.
    await adminPage.goto("/admin/tickets?status=all");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.getByRole("button", { name: "Disputed only" }).click();
    await expect(adminPage).toHaveURL(/[?&]disputed=true(&|$)/);
    await adminPage.waitForLoadState("networkidle");
    await expect(adminPage.getByRole("link", { name: `E2E dispute check dispute-${citizen.email}` })).toBeVisible();
    await expect(adminPage.getByText("Disputed", { exact: true }).first()).toBeVisible();

    await adminPage.goto(`/admin/tickets/${ticketId}`);
    await expect(adminPage.getByText(/^Disputed /).first()).toBeVisible();
    await expect(adminPage.getByText("Citizen reports issue not fixed")).toBeVisible();
    await expect(adminPage.getByText("The pothole is still there.")).toBeVisible();

    await adminContext.close();
  });

  test("a resolved ticket's dispute does not add a new sidebar item", async ({ page }) => {
    await loginAdmin(page);
    const nav = page.getByRole("navigation", { name: "Admin" });
    const expected = ["Dashboard", "Ticket Queue", "Interactive Map", "Barangay Insights", "Work Orders", "Flagged Reports", "Reports & Exports", "Notifications"];
    await expect(nav.getByRole("link")).toHaveCount(expected.length);
  });
});

test.describe("Case Closure Summary", () => {
  test("does not appear on an unresolved report", async ({ page }) => {
    const submitRes = await page.request.post("/api/reports", {
      multipart: {
        title: "E2E summary not-yet-resolved check",
        category: "Pothole / Road Surface Damage",
        citizen_severity: "Low",
        lat: "15.0711",
        lng: "120.5401",
        image: {
          name: "01_poblacion.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync("public/uploads/reports/01_poblacion.jpg"),
        },
      },
    });
    const { reportId } = (await submitRes.json()) as { reportId: number };
    await page.goto(`/dashboard/reports/${reportId}`);
    await expect(page.getByText("Case Closure Summary")).toHaveCount(0);
  });

  test("appears on a resolved report with resolution notes and photo, and stays consistent with confirmed feedback", async ({ page, browser }) => {
    const citizen = await signupCitizen(page, "summary-confirm");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage);

    const jitter = () => (Math.random() - 0.5) * 0.01;
    const submitRes = await page.request.post("/api/reports", {
      multipart: {
        title: `E2E summary confirm ${citizen.email}`,
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
    const { reportId, ticketId } = (await submitRes.json()) as { reportId: number; ticketId: number };

    // Reported -> Under Review -> In Progress, then Resolved with real notes
    // and a resolution photo — the exact fields the summary card surfaces.
    for (let i = 0; i < 2; i++) {
      await adminPage.request.post(`/api/admin/tickets/${ticketId}/status`, { multipart: { notes: "e2e" } });
    }
    const resolveRes = await adminPage.request.post(`/api/admin/tickets/${ticketId}/status`, {
      multipart: {
        notes: "Pothole patched and repaved.",
        image: {
          name: "01_poblacion.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync("public/uploads/reports/01_poblacion.jpg"),
        },
      },
    });
    expect(resolveRes.ok()).toBe(true);
    await adminContext.close();

    await page.goto(`/dashboard/reports/${reportId}`);
    await expect(page.getByText("Case Closure Summary")).toBeVisible();
    // .first() since resolvedUpdateLine() also surfaces resolution_notes in
    // the Timeline card's "Latest Update" banner — same underlying data,
    // two different display surfaces.
    await expect(page.getByText("Pothole patched and repaved.").first()).toBeVisible();
    await expect(page.getByAltText("Photo taken by staff confirming the resolution")).toBeVisible();
    // No confirm/dispute feedback recap yet — the citizen hasn't acted.
    await expect(page.getByText("You confirmed this issue was fixed.")).toHaveCount(0);
    await expect(page.getByText("You reported that this issue isn't actually fixed.")).toHaveCount(0);

    await page.getByRole("button", { name: "Confirm Fixed" }).click();
    await expect(page.getByText("Thanks for confirming")).toBeVisible();

    // The summary card's recap and the action card's own message are both
    // visible and consistent with each other after reload — no admin-only
    // dispute_reason/work-order text leaks anywhere on the page.
    await page.reload();
    await expect(page.getByText("Case Closure Summary")).toBeVisible();
    await expect(page.getByText("You confirmed this issue was fixed.")).toBeVisible();
    await expect(page.getByText("Thanks for confirming")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("work_order");
    expect(bodyText).not.toContain("moderation_note");
  });

  test("stays consistent with disputed feedback and shows no admin-only fields", async ({ page, browser }) => {
    const citizen = await signupCitizen(page, "summary-dispute");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage);
    const { reportId } = await submitAndResolveReport(page, adminPage, `summary-dispute-${citizen.email}`);
    await adminContext.close();

    await page.goto(`/dashboard/reports/${reportId}`);
    await expect(page.getByText("Case Closure Summary")).toBeVisible();

    await page.getByRole("button", { name: "Report Still Not Fixed" }).click();
    await page.getByLabel("What's still wrong?").fill("Still broken.");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("You reported that this issue isn't actually fixed.").first()).toBeVisible();

    await page.reload();
    await expect(page.getByText("Case Closure Summary")).toBeVisible();
    // Both the summary card's recap line and the action card's own message
    // read the same disputed state consistently.
    await expect(page.getByText("You reported that this issue isn't actually fixed.").first()).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("Still broken."); // dispute_reason is admin-only, never shown to the citizen
  });
});
