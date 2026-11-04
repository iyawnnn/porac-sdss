import { expect, type Browser, type Page } from "@playwright/test";
import { loginCitizen } from "./helpers";
import { E2E_CITIZEN_ACCOUNT } from "./test-credentials";

interface NoticeCheck {
  reportId: number;
  type: string;
  message: string;
  forbidden: string[];
  count?: number;
}

export async function expectCitizenNotice(page: Page, check: NoticeCheck) {
  const response = await page.request.get(`/api/notifications?type=${check.type}&limit=100`);
  expect(response.ok()).toBe(true);
  const { items } = await response.json() as { items: { href: string | null; message: string }[] };
  const own = items.filter((n) => n.href === `/dashboard/reports/${check.reportId}`);
  expect(own).toHaveLength(check.count ?? 1);
  expect(own.some((n) => n.message === check.message)).toBe(true);
  for (const notice of own) {
    expect(Object.keys(notice).sort()).toEqual(["createdAt", "href", "id", "message", "readAt", "title", "type"]);
    for (const text of check.forbidden) expect(notice.message).not.toContain(text);
  }
  await page.reload();
  await page.getByRole("button", { name: /^(Notifications|\d+ unread notifications)$/ }).click();
  await expect(page.getByRole("menu").getByText(check.message, { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
}

export async function expectCitizenNoticeForAccount(browser: Browser, check: NoticeCheck) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await loginCitizen(page, E2E_CITIZEN_ACCOUNT);
    await expectCitizenNotice(page, check);
  } finally {
    await context.close();
  }
}
