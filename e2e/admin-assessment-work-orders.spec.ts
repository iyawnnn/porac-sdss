import { expect, test, type Page } from "@playwright/test";
import { E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin, settleAdminPage } from "./helpers";

// Operational Assessment and Work Orders (manuscript pp. 44–45, Appendix H
// OPERATIONAL_ASSESSMENTS and WORK_ORDERS, Tables 3–4; manuscript revision
// Phase 5, step 5b): no Work Order without an assessment; pending ->
// in progress -> completed only; cancelling needs a reason and may name a
// replacement on the same ticket; Completed and Cancelled are final; a
// Rejected ticket takes neither. Posts no report: the tickets come from
// api/scripts/seed/seed-e2e-grouping-fixtures.ts, which e2e/global-setup.ts
// runs and e2e/global-teardown.ts retires as Rejected (a full run
// posts 15 reports, kept at 16 or fewer under the 20-an-hour per-IP limit; docs/testing.md §6). Serial
// (--workers=1): the Work Orders created here stay on the fixture ticket.

test.setTimeout(60_000);

interface Fixtures {
  assessmentWorkOrders: { noAssessmentTicketId: number; assessedTicketId: number };
  routing: { rejected: { ticketId: number } };
}

const fixtures: Fixtures | null = process.env.E2E_GROUPING_FIXTURES
  ? (() => {
      const parsed = JSON.parse(process.env.E2E_GROUPING_FIXTURES) as Partial<Fixtures>;
      return parsed.assessmentWorkOrders && parsed.routing ? (parsed as Fixtures) : null;
    })()
  : null;

const ASSESSMENT_REQUIRED = "Add an Operational Assessment first.";

async function expectRefusal(
  page: Page,
  method: "post" | "patch",
  path: string,
  data: Record<string, unknown>,
  status: number,
  message: string | RegExp,
) {
  const res = await page.request[method](path, { data });
  expect(res.status()).toBe(status);
  const body = (await res.json()) as { message: string };
  if (typeof message === "string") expect(body.message).toBe(message);
  else expect(body.message).toMatch(message);
}

async function createWorkOrder(page: Page, ticketId: number, title: string): Promise<number> {
  const res = await page.request.post("/api/admin/work-orders", { data: { ticketId, title } });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: number }).id;
}

async function setStatus(page: Page, id: number, status: string) {
  const res = await page.request.post(`/api/admin/work-orders/${id}/status`, { data: { status } });
  expect(res.ok()).toBe(true);
}

test.describe.serial("Operational Assessment and Work Orders", () => {
  test.skip(!fixtures, "needs the fixtures e2e/global-setup.ts inserts");

  test("without an assessment, New Work Order gives way to the assessment-first message and the API refuses with 409", async ({ page }) => {
    const ticketId = fixtures!.assessmentWorkOrders.noAssessmentTicketId;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const message = page.getByTestId("work-order-assessment-required");
    await settleAdminPage(page, message);
    await expect(message).toHaveText(ASSESSMENT_REQUIRED);
    await expect(page.getByRole("button", { name: "New Work Order" })).toHaveCount(0);

    await expectRefusal(page, "post", "/api/admin/work-orders", { ticketId, title: "E2E: blocked" }, 409, ASSESSMENT_REQUIRED);
    // Bulk reports it per ticket and creates nothing.
    const bulk = await page.request.post("/api/admin/work-orders/bulk", { data: { ticketIds: [ticketId], title: "E2E: blocked" } });
    expect(bulk.ok()).toBe(true);
    expect((await bulk.json()) as unknown).toEqual({ ok: [], skipped: [{ id: ticketId, reason: ASSESSMENT_REQUIRED }] });

    // The assessment form needs Observed Conditions (closed without saving,
    // so this ticket keeps having no assessment).
    await page.getByRole("button", { name: "Add Assessment" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Assessment" });
    await dialog.getByRole("button", { name: "Save Assessment" }).click();
    await expect(dialog.getByText("Observed conditions are required.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("cancelling needs a reason; the cancelled Work Order is final and links its replacement on the same ticket", async ({ page }) => {
    const ticketId = fixtures!.assessmentWorkOrders.assessedTicketId;
    await loginAdmin(page, E2E_MEO_ADMIN);
    const stamp = Date.now();
    const cancelledId = await createWorkOrder(page, ticketId, `E2E cancel ${stamp}`);
    const replacementId = await createWorkOrder(page, ticketId, `E2E replacement ${stamp}`);

    // A reason is required through either endpoint.
    await expectRefusal(page, "post", `/api/admin/work-orders/${cancelledId}/cancel`, { reason: "   " }, 400, "A cancellation reason is required.");
    await expectRefusal(page, "post", `/api/admin/work-orders/${cancelledId}/status`, { status: "cancelled" }, 400, "A cancellation reason is required.");

    await page.goto(`/admin/tickets/${ticketId}`);
    const item = page.getByTestId(`work-order-${cancelledId}`);
    await settleAdminPage(page, item);
    await item.getByRole("combobox", { name: `Status for work order #${cancelledId}` }).click();
    await page.getByRole("option", { name: "Cancel…" }).click();
    const dialog = page.getByRole("dialog", { name: `Cancel Work Order #${cancelledId}` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel Work Order" }).click();
    await expect(dialog.getByText("A cancellation reason is required.")).toBeVisible();

    await dialog.getByLabel("Cancellation reason").fill("E2E: crew reassigned to the replacement work order.");
    await dialog.getByRole("combobox", { name: "Replacement work order" }).click();
    await page.getByRole("option", { name: new RegExp(`^#${replacementId} `) }).click();
    const posted = page.waitForResponse(
      (r) => r.url().includes(`/api/admin/work-orders/${cancelledId}/cancel`) && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Cancel Work Order" }).click();
    expect((await posted).ok()).toBe(true);
    await expect(dialog).toHaveCount(0);

    // Final: reason, who and when, the replacement link, no controls.
    await expect(item.getByText("Reason: E2E: crew reassigned to the replacement work order.")).toBeVisible();
    await expect(item.getByText(/^Cancelled by .+ on /)).toBeVisible();
    await expect(item.getByRole("link", { name: `Work Order #${replacementId}` })).toHaveAttribute("href", `#work-order-${replacementId}`);
    await expect(item.getByRole("combobox")).toHaveCount(0);
    await expect(item.getByRole("button")).toHaveCount(0);

    // And the API agrees: no edit, no status, no second cancel.
    const final = /is cancelled and final; it can no longer be changed\.$/;
    await expectRefusal(page, "patch", `/api/admin/work-orders/${cancelledId}`, { notes: "late note" }, 409, final);
    await expectRefusal(page, "post", `/api/admin/work-orders/${cancelledId}/status`, { status: "in_progress" }, 409, final);
    await expectRefusal(page, "post", `/api/admin/work-orders/${cancelledId}/cancel`, { reason: "again" }, 409, final);

    // The ticket's own status did not change.
    const detail = await page.request.get(`/api/admin/tickets/${ticketId}`);
    expect(((await detail.json()) as { ticket: { status: string } }).ticket.status).toBe("Under Review");
  });

  test("a Work Order only moves forward, and once completed it is read-only", async ({ page }) => {
    const ticketId = fixtures!.assessmentWorkOrders.assessedTicketId;
    await loginAdmin(page, E2E_MEO_ADMIN);
    const id = await createWorkOrder(page, ticketId, `E2E complete ${Date.now()}`);

    await expectRefusal(
      page,
      "post",
      `/api/admin/work-orders/${id}/status`,
      { status: "completed" },
      409,
      `Work Order #${id} cannot move from pending to completed.`,
    );
    await setStatus(page, id, "in_progress");
    await expectRefusal(
      page,
      "post",
      `/api/admin/work-orders/${id}/status`,
      { status: "pending" },
      409,
      `Work Order #${id} cannot move from in progress to pending.`,
    );
    await setStatus(page, id, "completed");

    const final = `Work Order #${id} is completed and final; it can no longer be changed.`;
    await expectRefusal(page, "patch", `/api/admin/work-orders/${id}`, { notes: "late note" }, 409, final);
    await expectRefusal(page, "post", `/api/admin/work-orders/${id}/status`, { status: "in_progress" }, 409, final);
    await expectRefusal(page, "post", `/api/admin/work-orders/${id}/cancel`, { reason: "too late" }, 409, final);

    await page.goto(`/admin/tickets/${ticketId}`);
    const item = page.getByTestId(`work-order-${id}`);
    await settleAdminPage(page, item);
    await expect(item.getByText(/^Completed on .+\. Final; no further changes\.$/)).toBeVisible();
    await expect(item.getByRole("combobox")).toHaveCount(0);
    await expect(item.getByRole("button")).toHaveCount(0);

    const detail = await page.request.get(`/api/admin/tickets/${ticketId}`);
    expect(((await detail.json()) as { ticket: { status: string } }).ticket.status).toBe("Under Review");
  });

  test("a Rejected ticket takes no assessment and no Work Order (409)", async ({ page }) => {
    const ticketId = fixtures!.routing.rejected.ticketId;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await expectRefusal(
      page,
      "post",
      `/api/admin/tickets/${ticketId}/assessment`,
      { observedConditions: "E2E: should be refused" },
      409,
      `Ticket #${ticketId} is Rejected; its Operational Assessment can no longer be changed.`,
    );
    await expectRefusal(
      page,
      "post",
      "/api/admin/work-orders",
      { ticketId, title: "E2E: should be refused" },
      409,
      `Ticket #${ticketId} is Rejected; its Work Orders can no longer be created or changed.`,
    );
  });
});
