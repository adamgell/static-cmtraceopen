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

const nightlyRelease = {
  tag: "nightly",
  name: "CMTrace Open Nightly",
  publishedAt: "2026-07-13T21:30:00Z",
  htmlUrl: "https://github.com/adamgell/cmtraceopen/releases/tag/nightly",
  assets: releaseFixture.assets
    .filter((asset) => asset.browser_download_url.includes("/releases/download/nightly/"))
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      size: asset.size,
      contentType: asset.content_type,
      browserDownloadUrl: asset.browser_download_url,
      releaseTag: "nightly",
      channel: "nightly",
      publishedAt: "2026-07-13T21:30:00Z",
      ...asset.expected,
    })),
};

test("skip link stays out of layout until keyboard focus", async ({ page }) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  const header = page.locator("body > header");
  const headerTopBeforeFocus = (await header.boundingBox())?.y;
  const skipLinkBoxBeforeFocus = await skipLink.boundingBox();

  await expect(skipLink).not.toBeInViewport();
  expect(skipLinkBoxBeforeFocus).not.toBeNull();
  expect(skipLinkBoxBeforeFocus!.y + skipLinkBoxBeforeFocus!.height).toBeLessThanOrEqual(-4);
  expect(headerTopBeforeFocus).toBe(0);

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();

  const skipLinkBox = await skipLink.boundingBox();
  expect(skipLinkBox).not.toBeNull();
  expect(skipLinkBox!.width).toBeLessThanOrEqual(240);
  expect(skipLinkBox!.height).toBeLessThanOrEqual(56);
  expect((await header.boundingBox())?.y).toBe(headerTopBeforeFocus);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
});

test("desktop hero keeps its evidence composition tightly grouped", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await Promise.all(
    [".hero-copy", ".screenshot-frame"].map((selector) =>
      page.locator(selector).evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      }),
    ),
  );

  const gaps = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>("body > header");
    const heading = document.querySelector<HTMLElement>(".hero h1");
    const trustLine = document.querySelector<HTMLElement>(".hero .trust-line");
    const screenshot = document.querySelector<HTMLElement>(".product-view .screenshot-frame");

    if (!header || !heading || !trustLine || !screenshot) {
      throw new Error("Expected homepage composition targets were not rendered");
    }

    return {
      headerToHeading: Math.round(heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom),
      trustToScreenshot: Math.round(screenshot.getBoundingClientRect().top - trustLine.getBoundingClientRect().bottom),
    };
  });

  const measuredGaps = `Measured gaps: ${JSON.stringify(gaps)}`;
  expect(gaps.headerToHeading, measuredGaps).toBeLessThanOrEqual(32);
  expect(gaps.trustToScreenshot, measuredGaps).toBeLessThanOrEqual(64);
});

test("hero spacing remains continuous across the tablet breakpoint", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const measurements: Record<number, { heroHeight: number; headerToHeading: number; trustToScreenshot: number }> = {};

  for (const width of [900, 901]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await Promise.all(
      [".hero-copy", ".screenshot-frame"].map((selector) =>
        page.locator(selector).evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
        }),
      ),
    );

    measurements[width] = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>("body > header");
      const hero = document.querySelector<HTMLElement>(".hero");
      const heading = document.querySelector<HTMLElement>(".hero h1");
      const trustLine = document.querySelector<HTMLElement>(".hero .trust-line");
      const screenshot = document.querySelector<HTMLElement>(".product-view .screenshot-frame");

      if (!header || !hero || !heading || !trustLine || !screenshot) {
        throw new Error("Expected homepage composition targets were not rendered");
      }

      return {
        heroHeight: Math.round(hero.getBoundingClientRect().height),
        headerToHeading: Math.round(heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom),
        trustToScreenshot: Math.round(screenshot.getBoundingClientRect().top - trustLine.getBoundingClientRect().bottom),
      };
    });
  }

  const measuredLayout = `Measured breakpoint layout: ${JSON.stringify(measurements)}`;
  for (const width of [900, 901]) {
    expect(measurements[width].headerToHeading, measuredLayout).toBeGreaterThanOrEqual(0);
    expect(measurements[width].headerToHeading, measuredLayout).toBeLessThanOrEqual(32);
    expect(measurements[width].trustToScreenshot, measuredLayout).toBeGreaterThanOrEqual(0);
    expect(measurements[width].trustToScreenshot, measuredLayout).toBeLessThanOrEqual(64);
  }
  expect(Math.abs(measurements[900].heroHeight - measurements[901].heroHeight), measuredLayout).toBeLessThanOrEqual(8);
});

test("homepage is keyboard navigable and axe clean", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("homepage guide cards align their actions and column rules", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const layout = await page.locator(".guide-list li").evaluateAll((cards) => ({
    actionTops: cards.map((card) => Math.round(card.querySelector(".guide-link")!.getBoundingClientRect().top)),
    labelLefts: cards.map((card) => Math.round(card.querySelector(".technical-label")!.getBoundingClientRect().left)),
    borders: cards.map((card) => Number.parseFloat(getComputedStyle(card).borderRightWidth)),
    rightPadding: cards.map((card) => Number.parseFloat(getComputedStyle(card).paddingRight)),
  }));

  expect(new Set(layout.actionTops.slice(0, 3)).size).toBe(1);
  expect(new Set(layout.actionTops.slice(3, 5)).size).toBe(1);
  expect(layout.labelLefts[3]).toBe(layout.labelLefts[0]);
  expect(layout.labelLefts[4]).toBe(layout.labelLefts[1]);
  expect(layout.borders[4]).toBeGreaterThan(0);
  expect(layout.rightPadding[2]).toBe(0);
  expect(layout.rightPadding[4]).toBeGreaterThan(0);
});

test("Field Guide presents the five migrated field notes", async ({ page }) => {
  await page.goto("/field-guide/");

  await expect(page.getByRole("heading", { name: "Notes from the endpoint trenches." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Why CMTrace Open Exists" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Known Log Sources: Stop Hunting for File Paths" })).toBeVisible();
  await expect(page.locator(".field-guide-index li")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Releases" })).toHaveCount(0);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("Field Guide article renders migrated prose and screenshots without overflow", async ({ page }) => {
  await page.goto("/field-guide/5-minutes-cmtrace-open/");

  await expect(page.getByRole("heading", { name: "Your First 5 Minutes with CMTrace Open", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keyboard Shortcuts" })).toBeVisible();
  await expect(page.locator(".field-guide-copy img")).toHaveCount(8);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("nightly page presents live development packages in the product design system", async ({ page }) => {
  await page.route("**/api/releases/nightly", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(nightlyRelease) }),
  );
  await page.goto("/nightly/");

  await expect(page.getByRole("heading", { level: 1, name: "Builds from main, ready for testing." })).toBeVisible();
  await expect(page.getByText("Nightly is published.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download Windows x64 portable" })).toHaveAttribute(
    "href",
    "https://download.cmtraceopen.com/nightly-asset/475898689?source=nightly-builds-page",
  );
  await expect(page.getByText("latest.json", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Open nightly builds.")).toHaveCount(0);
  await expect(page.locator('a[href="https://adamgell.com/cmtraceopen/"]')).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("narrow layout does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBe(0);
});

test("hero honors reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const durations = await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>(".hero-copy");
    const heroButton = document.querySelector<HTMLElement>(".hero .button");

    if (!hero || !heroButton) throw new Error("Expected hero motion targets were not rendered");

    const toMilliseconds = (value: string) =>
      value.split(",").map((duration) => {
        const normalized = duration.trim();
        if (normalized.endsWith("ms")) return Number.parseFloat(normalized);
        if (normalized.endsWith("s")) return Number.parseFloat(normalized) * 1_000;
        throw new Error(`Unsupported CSS duration: ${normalized}`);
      });

    return [
      ...toMilliseconds(getComputedStyle(hero).animationDuration),
      ...toMilliseconds(getComputedStyle(heroButton).transitionDuration),
    ];
  });

  expect(durations.length).toBeGreaterThan(0);
  for (const duration of durations) expect(duration).toBeLessThanOrEqual(0.01);
});
