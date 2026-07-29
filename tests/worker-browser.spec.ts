import { expect, test } from "@playwright/test";

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'";

const publicStats = {
  generatedAt: "2026-07-15T12:00:00.000Z",
  github: {
    status: "fresh",
    updatedAt: "2026-07-15T12:00:00.000Z",
    stars: 229,
    packageDownloads: {
      total: 24_305,
      stable: 24_301,
      currentNightly: 4,
      byPlatform: { windows: 20_000, macos: 3_000, linux: 1_305 },
    },
  },
  selections: {
    status: "fresh",
    updatedAt: "2026-07-15T12:00:00.000Z",
    windowDays: 30,
    total: 84,
    byChannel: { stable: 80, nightly: 4 },
    byPlatform: { windows: 65, macos: 12, linux: 7 },
    bySource: { "download-home": 60, "github-release": 24 },
  },
};

test("Worker CSP preserves scoped page styles without browser violations", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|content security policy/i.test(message.text())) {
      cspViolations.push(message.text());
    }
  });

  const response = await page.goto("/privacy/");

  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toBe(CSP);
  const structuredData = page.locator('script[type="application/ld+json"]');
  await expect(structuredData).toHaveCount(1);
  expect(JSON.parse((await structuredData.textContent()) ?? "null")).toMatchObject({
    "@type": "SoftwareApplication",
    url: "https://cmtraceopen.com/",
  });
  await expect(page.locator(".resource-hero")).toBeVisible();
  const minimumHeight = await page.locator(".resource-hero").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).minHeight),
  );
  expect(minimumHeight).toBeGreaterThanOrEqual(480);
  expect(cspViolations).toEqual([]);
});

test("stats ledger loads through Wrangler and requests its same-origin endpoint under CSP", async ({ page }) => {
  const cspViolations: string[] = [];
  let statsRequestUrl = "";
  page.on("console", (message) => {
    if (/Content Security Policy|content security policy/i.test(message.text())) {
      cspViolations.push(message.text());
    }
  });
  await page.route("**/api/stats", (route) => {
    statsRequestUrl = route.request().url();
    expect(route.request().headers()["accept"]).toBe("application/json");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicStats) });
  });

  const response = await page.goto("/stats/");

  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toBe(CSP);
  await expect(page.locator('[data-stat="package-total"]')).toHaveText("24,305");
  expect(statsRequestUrl).toBe("http://localhost:8787/api/stats");
  expect(cspViolations).toEqual([]);
});

test("download-host branded 404 routes every product recovery link to the product origin", async ({ page }) => {
  const response = await page.goto("http://download.localhost:8787/missing-field-note/");

  expect(response?.status()).toBe(404);
  expect(response?.headers()["content-security-policy"]).toBe(CSP);
  await expect(page.getByRole("heading", { name: "This route dropped out of the timeline." })).toBeVisible();
  await expect(page.getByRole("link", { name: "CMTrace Open home" })).toHaveAttribute(
    "href",
    "https://cmtraceopen.com/",
  );
  await expect(page.locator("body > header").getByRole("link", { name: "Field Guide" })).toHaveAttribute(
    "href",
    "https://cmtraceopen.com/field-guide/",
  );
  await expect(page.getByRole("link", { name: "Return to the product" })).toHaveAttribute(
    "href",
    "https://cmtraceopen.com/",
  );
  await expect(page.getByRole("link", { name: "Browse field guides" })).toHaveAttribute(
    "href",
    "https://cmtraceopen.com/field-guide/",
  );
  await expect(page.locator("body > footer").getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    "https://cmtraceopen.com/privacy/",
  );
  expect(await page.locator("body").innerText()).not.toContain("/_download/");
});
