import { expect, test } from "@playwright/test";

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'";

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
