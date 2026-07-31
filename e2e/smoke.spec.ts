import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { generateExifImage } from "../lib/utils/generate-exif-image";

test.setTimeout(90_000);

const fixtureDir = path.join(process.cwd(), "test-results", "report-form-fixtures");
const noExifFixture = path.join(fixtureDir, "no_exif.jpg");
const outsidePoracFixture = path.join(fixtureDir, "outside_porac.jpg");
const poblacionFixture = path.join(process.cwd(), "public", "uploads", "reports", "01_poblacion.jpg");

async function loginCitizen(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.waitForTimeout(500);
  await page.getByLabel("Email").fill("citizen1@porac.ph");
  await page.getByPlaceholder("Password").fill("PoracDemo2026!");
  await page.getByRole("button", { name: "Sign In with Email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("link", { name: "My Reports" }).click();
  await expect(page).toHaveURL(/\/reports/);
}

test.beforeAll(async () => {
  mkdirSync(fixtureDir, { recursive: true });
  await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 130, g: 130, b: 130 } } })
    .jpeg({ quality: 88 })
    .toFile(noExifFixture);
  await generateExifImage({ outputPath: outsidePoracFixture, lat: 14.5, lng: 120.0 });
});

test("MEO admin can open the Porac map without runtime failures", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(`pageerror: ${error.message}`));
  page.on("response", response => { if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto("/admin/login");
  await page.waitForTimeout(1_000);
  await page.getByLabel("Email").fill("meo@porac.gov.ph");
  await page.getByPlaceholder("Password").fill("PoracDemo2026!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "Interactive Map" }).click();
  await expect(page).toHaveURL(/\/admin\/map/);
  await expect(page.locator(".leaflet-container")).toBeVisible();
  const image = await page.request.get("/uploads/reports/01_poblacion.jpg");
  expect(image.status()).toBe(200);
  await expect(page.locator("text=Loading tickets...")).toHaveCount(0);
  for (const status of ["active", "all", "Resolved", "Reported"]) {
    const response = await page.goto(`/admin/tickets?status=${status}`);
    expect(response?.status()).toBe(200);
  }
  await page.goto("/admin/flagged", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Flagged Reports/ })).toBeVisible();
  await expect.poll(() => failures, { timeout: 10_000 }).toEqual([]);
});

test("citizen header navigates public map, my reports, report form, and logs out", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(`pageerror: ${error.message}`));
  page.on("response", response => { if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`); });

  await loginCitizen(page);
  await expect(page.getByText("Porac SDSS")).toBeVisible();
  await expect(page.locator("header").getByText("citizen1@porac.ph", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My Reports" })).toBeVisible();
  const image = page.locator('img[src^="/uploads/reports/"]').first();
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty("complete", true);
  await expect(image).toHaveJSProperty("naturalWidth", 600);

  await page.locator("header").getByRole("link", { name: "Map" }).click();
  await expect(page).toHaveURL(/\/map/);
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByText("Public Hazard Map")).toBeVisible();

  await page.getByRole("link", { name: "My Reports" }).click();
  await expect(page).toHaveURL(/\/reports/);
  await expect(page.getByRole("heading", { name: "My Reports" })).toBeVisible();

  await page.getByRole("link", { name: "Report Hazard" }).first().click();
  await expect(page).toHaveURL(/\/report/);
  await expect(page.getByRole("heading", { name: "Report a Hazard" })).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => failures, { timeout: 10_000 }).toEqual([]);
});

test("citizen report form validates EXIF GPS, dynamic barangay search, and Porac bounds", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(`pageerror: ${error.message}`));
  page.on("response", response => { if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`); });

  await loginCitizen(page);
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Report a Hazard" })).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByText("Please upload a photo first to enable map location pinning.")).toBeVisible();
  await expect(page.getByLabel("Barangay Search")).toBeDisabled();
  await expect(page.getByText("No pin selected")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(poblacionFixture);
  await expect(page.getByText("GPS Metadata Verified (EXIF Found)")).toBeVisible();
  await expect(page.getByLabel("Barangay Search")).toBeEnabled();
  await expect.poll(async () => page.getByLabel("Barangay Search").locator("option").count()).toBeGreaterThanOrEqual(29);
  await expect(page.getByLabel("Barangay Search").locator("option").filter({ hasText: "Landmark" })).toHaveCount(0);
  await expect(page.getByText(/Detected Barangay:/)).toBeVisible();
  await expect(page.getByText(/15\./)).toBeVisible();

  await page.getByLabel("Barangay Search").selectOption({ label: "Villa Maria" });
  await page.waitForTimeout(1_000);
  await page.locator(".leaflet-container").click({ position: { x: 300, y: 200 } });
  await expect(page.getByText("Pin placed >100m away from photo GPS. This submission will be flagged for review.")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(noExifFixture);
  await expect(page.getByText("No GPS Metadata Found in Photo. Please click the map to select the hazard location manually.")).toBeVisible();
  await page.getByLabel("Barangay Search").selectOption({ label: "Poblacion" });
  await page.waitForTimeout(1_000);
  await page.locator(".leaflet-container").click({ position: { x: 300, y: 200 } });
  await expect(page.getByText(/Detected Barangay:/)).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(outsidePoracFixture);
  await expect(page.getByText("Photo GPS location is outside Porac municipality bounds.").first()).toBeVisible();

  await expect.poll(() => failures, { timeout: 10_000 }).toEqual([]);
});
