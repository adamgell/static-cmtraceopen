import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const releaseFixture = JSON.parse(
  readFileSync(new URL("./fixtures/release-assets.json", import.meta.url), "utf8"),
) as {
  assets: Array<{
    id: number;
    name: string;
    size: number;
    content_type: string;
    browser_download_url: string;
    expected: Record<string, string>;
  }>;
};

const stableAssets = releaseFixture.assets
  .filter((asset) => asset.browser_download_url.includes("/releases/download/v1.4.0/"))
  .map((asset) => ({
    id: asset.id,
    name: asset.name,
    size: asset.size,
    contentType: asset.content_type,
    browserDownloadUrl: asset.browser_download_url,
    releaseTag: "v1.4.0",
    channel: "stable",
    publishedAt: "2026-07-12T19:24:00Z",
    ...asset.expected,
  }));

const stableRelease = {
  tag: "v1.4.0",
  name: "CMTrace Open v1.4.0",
  publishedAt: "2026-07-12T19:24:00Z",
  htmlUrl: "https://github.com/adamgell/cmtraceopen/releases/tag/v1.4.0",
  assets: stableAssets,
};

async function mockStableRelease(page: import("@playwright/test").Page) {
  await page.route("**/api/releases/stable", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stableRelease) }),
  );
}

test("stable download center puts package selection first without the removed trust explainer", async ({ page }) => {
  await mockStableRelease(page);

  await page.goto("/_download/?source=cmtraceopen-product");

  await expect(page.locator("main > section").first()).toHaveClass(/download-chooser/);
  await expect(page.getByRole("heading", { level: 1, name: "Choose the package that fits the endpoint." })).toBeVisible();
  await expect(page.getByText("Full portable application")).toBeVisible();
  await expect(page.getByText("Recommended", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Download x64/i })).toHaveAttribute(
    "href",
    "/asset/475711960?source=cmtraceopen-product",
  );
  await expect(page.getByRole("heading", { name: "Download CMTrace Open" })).toHaveCount(0);
  await expect(page.getByText("RELEASE INTEGRITY", { exact: true })).toHaveCount(0);
  await expect(page.getByText("DISTRIBUTION TRUST", { exact: true })).toHaveCount(0);
});

test("platform tabs are keyboard accessible and separate technical release files", async ({ page }) => {
  await mockStableRelease(page);
  await page.goto("/_download/");

  const windowsTab = page.getByRole("tab", { name: "Windows" });
  const macosTab = page.getByRole("tab", { name: "macOS" });
  const allTab = page.getByRole("tab", { name: "All assets" });
  await expect(windowsTab).toHaveAttribute("aria-selected", "true");

  await windowsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(macosTab).toBeFocused();
  await expect(macosTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: /Download macOS ARM64/i })).toHaveAttribute(
    "href",
    "/asset/475701213?source=download-home",
  );

  await allTab.click();
  await expect(page.getByRole("heading", { name: "Technical release files" })).toBeVisible();
  await expect(page.getByText("latest.json", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Download latest\.json/i })).toHaveCount(0);
});

test("Windows packages keep the x64 hierarchy ahead of a separate ARM64 group", async ({ page }) => {
  await mockStableRelease(page);
  await page.goto("/_download/");

  await expect(page.getByRole("heading", { name: "ARM64 packages" })).toBeVisible();
  await expect(page.locator(".package-action").evaluateAll((links) => links.slice(0, 4).map((link) => link.textContent))).resolves.toEqual([
    "Download x64",
    "Download MSI · x64",
    "Download setup · x64",
    "Download Lite x64",
  ]);
});

test("arbitrary source labels normalize to unknown and links only use numeric asset IDs", async ({ page }) => {
  await mockStableRelease(page);
  await page.goto("/_download/?source=user-123");

  const packageLinks = page.locator('a[href^="/asset/"]');
  await expect(packageLinks.first()).toBeVisible();
  const hrefs = await packageLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toMatch(/^\/asset\/\d+\?source=unknown$/);
    expect(href).not.toContain("github.com");
  }
});

test("release discovery failure keeps a direct GitHub Releases fallback", async ({ page }) => {
  await page.route("**/api/releases/stable", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) }),
  );

  await page.goto("/_download/");

  await expect(page.getByRole("heading", { name: "Release discovery is temporarily unavailable" })).toBeVisible();
  await expect(page.getByText("No download was selected or counted.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open GitHub Releases" })).toHaveAttribute(
    "href",
    "https://github.com/adamgell/cmtraceopen/releases",
  );
});

test("download center stays within a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockStableRelease(page);
  await page.goto("/_download/");

  await expect(page.getByRole("link", { name: /Download x64/i })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  const button = await page.getByRole("link", { name: /Download x64/i }).boundingBox();
  expect(button).not.toBeNull();
  expect(button!.x).toBeGreaterThanOrEqual(0);
  expect(button!.x + button!.width).toBeLessThanOrEqual(320);
});

test("internal download build path keeps the public download canonical out of the product sitemap", async ({ page, request }) => {
  await mockStableRelease(page);
  await page.goto("/_download/");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://download.cmtraceopen.com/");
  const sitemap = await (await request.get("/sitemap-0.xml")).text();
  expect(sitemap).not.toContain("https://cmtraceopen.com/_download/");
});

test("All Assets is WCAG AA clean at desktop and 320px", async ({ page }) => {
  await mockStableRelease(page);

  for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/_download/");
    await page.getByRole("tab", { name: "All assets" }).click();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations, `Viewport ${viewport.width}px`).toEqual([]);
  }
});

test("download surface sends product-owned navigation to cmtraceopen.com", async ({ page }) => {
  await mockStableRelease(page);
  await page.goto("/_download/");

  const header = page.locator("body > header");
  const footer = page.locator("body > footer");
  await expect(header.getByRole("link", { name: "CMTrace Open home" })).toHaveAttribute("href", "https://cmtraceopen.com/");
  await expect(header.getByRole("link", { name: "Product", exact: true })).toHaveAttribute("href", "https://cmtraceopen.com/");
  await expect(header.getByRole("link", { name: "Field Guide" })).toHaveAttribute("href", "https://cmtraceopen.com/field-guide/");
  await expect(header.getByRole("link", { name: "Releases" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Download" })).toHaveAttribute("href", "https://download.cmtraceopen.com/?source=cmtraceopen-product");
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "https://cmtraceopen.com/privacy/");

  await page.goto("/");
  await expect(page.locator("body > header").getByRole("link", { name: "CMTrace Open home" })).toHaveAttribute("href", "/");
  await expect(page.locator("body > footer").getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy/");
});

test("stable readout derives signature status from classified assets", async ({ page }) => {
  await mockStableRelease(page);
  await page.goto("/_download/");
  await expect(page.locator("[data-signature-status]")).toHaveText("Detached signatures published");

  await page.unroute("**/api/releases/stable");
  await page.route("**/api/releases/stable", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...stableRelease,
        assets: stableRelease.assets.filter((asset) => asset.packageType !== "signature"),
      }),
    }),
  );
  await page.reload();
  await expect(page.locator("[data-signature-status]")).toHaveText("No detached signatures listed");
});

test("malformed release assets fail closed instead of being mislabeled", async ({ page }) => {
  await page.route("**/api/releases/stable", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...stableRelease, assets: [{ id: 123, packageType: "not-a-package" }] }),
    }),
  );
  await page.goto("/_download/");

  await expect(page.getByRole("heading", { name: "Release discovery is temporarily unavailable" })).toBeVisible();
  await expect(page.locator('a[href^="/asset/"]')).toHaveCount(0);
});

test("contradictory classified fields cannot turn latest.json into a user package", async ({ page }) => {
  const manifest = stableRelease.assets.find((asset) => asset.name === "latest.json");
  expect(manifest).toBeDefined();
  await page.route("**/api/releases/stable", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...stableRelease,
        assets: [{
          ...manifest,
          platform: "windows",
          architecture: "x64",
          edition: "full",
          packageType: "updater-manifest",
          deliveryRole: "manual-only",
        }],
      }),
    }),
  );
  await page.goto("/_download/");

  await expect(page.getByRole("heading", { name: "Release discovery is temporarily unavailable" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "RPM package" })).toHaveCount(0);
  await expect(page.locator('a[href^="/asset/"]')).toHaveCount(0);
});
