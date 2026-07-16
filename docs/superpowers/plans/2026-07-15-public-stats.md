# Public Project Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish privacy-preserving CMTrace Open package-download, GitHub-star, and 30-day verified-selection statistics on the homepage and a dedicated `/stats/` page.

**Architecture:** A first-party `/api/stats` Worker route aggregates GitHub repository/release data with Cloudflare Analytics Engine SQL results. The Worker reuses the existing release classifier, keeps provider credentials server-side, caches a complete snapshot for one hour, and retains successful provider values for a 24-hour stale fallback. Static Astro surfaces load one shared endpoint and render accessible text-first summaries.

**Tech Stack:** Astro 7, TypeScript 6, Cloudflare Workers, Workers Cache API, Analytics Engine SQL API, Vitest, Playwright, axe-core.

## Global Constraints

- The homepage stats section sits after the product screenshot and before the trust section; no counters appear in the hero.
- The headline package total combines published stable packages and packages attached to the current mutable `nightly` release.
- Only `manual-only` and `mixed-manual-update` assets count as human packages.
- Updater-only assets, manifests, signatures, SBOMs, unknown assets, and draft releases are excluded.
- Verified selections cover the trailing 30 days, include stable and nightly channels, and exclude the `unknown` source.
- Public copy calls the figures aggregate signals, never users, installations, devices, adoption, or active users.
- No provider credential or provider error body may enter a public response.
- Missing values render `Temporarily unavailable`; they never render as a fabricated zero.
- No new runtime dependency is required.

---

## File structure

- Create `src/lib/stats/types.ts`: public response contract and provider status types.
- Create `src/lib/stats/github.ts`: GitHub repository/release parsing and human-package aggregation.
- Create `src/lib/stats/analytics.ts`: Analytics Engine query, response validation, and dimension aggregation.
- Create `src/lib/stats/service.ts`: one-hour freshness, 24-hour stale fallback, provider isolation, and response assembly.
- Modify `src/lib/releases/classify.ts`: export the existing source-label allowlist so download recording and public queries cannot drift.
- Modify `src/worker/index.ts`: product-host `/api/stats` GET/HEAD route and secret wiring.
- Create `src/components/ProjectStats.astro`: compact homepage strip and expanded ledger markup.
- Create `src/scripts/project-stats.ts`: first-party fetch, formatting, loading, partial, stale, and unavailable states.
- Create `src/styles/stats.css`: evidence-strip and ledger layout.
- Create `src/pages/stats.astro`: public stats page and methodology.
- Modify `src/pages/index.astro`, `src/data/site.ts`, and `src/components/ProductFooter.astro`: placement and navigation.
- Create `tests/stats-github.test.ts`, `tests/stats-analytics.test.ts`, and `tests/stats-service.test.ts`: provider and cache contracts.
- Modify `tests/worker.test.ts`, `tests/site.spec.ts`, and `tests/content.test.mjs`: routing, UI, accessibility, and generated-content coverage.
- Modify `tests/worker-browser.spec.ts`: Wrangler-hosted stats route and CSP smoke coverage.
- Modify `analytics/queries.sql`, `analytics/schema.md`, and `README.md`: document the public query, scoped secrets, and verification commands.

---

### Task 1: GitHub package and star aggregation

**Files:**
- Create: `src/lib/stats/types.ts`
- Create: `src/lib/stats/github.ts`
- Create: `tests/stats-github.test.ts`

**Interfaces:**
- Consumes: `classifyAsset(name: string)` from `src/lib/releases/classify.ts`.
- Produces: `readGithubStats(fetcher: typeof fetch): Promise<GithubStats>`.
- Produces: `GithubStats`, `PlatformCounts`, `PackageDownloadCounts`, `ProviderStatus`, and `PublicStats` from `src/lib/stats/types.ts`.

- [ ] **Step 1: Write failing tests for stars, pagination, release filtering, and package classification**

Create fixtures inside `tests/stats-github.test.ts` that return repository metadata and two release pages. Assert this exact behavior:

```ts
expect(result).toEqual({
  stars: 229,
  packageDownloads: {
    total: 32,
    stable: 27,
    currentNightly: 5,
    byPlatform: { windows: 17, macos: 8, linux: 7 },
  },
});
expect(fetcher).toHaveBeenCalledWith(
  "https://api.github.com/repos/adamgell/cmtraceopen/releases?per_page=100&page=2",
  expect.objectContaining({ headers: expect.any(Object) }),
);
```

The fixtures must include an installer, DMG, AppImage, `latest.json`, updater archive, signature, SBOM, unknown file, draft release, ordinary stable release, current `nightly` prerelease, and unrelated prerelease. Assert that only human-installable stable and current-nightly packages contribute.

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run:

```bash
npx vitest run --config vitest.config.ts tests/stats-github.test.ts
```

Expected: FAIL because `src/lib/stats/github.ts` and its exported contract do not exist.

- [ ] **Step 3: Define the public stats contract**

Implement these exact shapes in `src/lib/stats/types.ts`:

```ts
export type ProviderStatus = "fresh" | "stale" | "unavailable";
export type PublicPlatform = "windows" | "macos" | "linux";
export type PublicChannel = "stable" | "nightly";

export type PlatformCounts = Record<PublicPlatform, number>;
export type ChannelCounts = Record<PublicChannel, number>;

export type PackageDownloadCounts = {
  total: number;
  stable: number;
  currentNightly: number;
  byPlatform: PlatformCounts;
};

export type GithubStats = {
  stars: number;
  packageDownloads: PackageDownloadCounts;
};

export type SelectionStats = {
  windowDays: 30;
  total: number;
  byChannel: ChannelCounts;
  byPlatform: PlatformCounts;
  bySource: Record<string, number>;
};

export type PublicStats = {
  generatedAt: string;
  github: {
    status: ProviderStatus;
    updatedAt: string | null;
    stars: number | null;
    packageDownloads: PackageDownloadCounts | null;
  };
  selections: {
    status: ProviderStatus;
    updatedAt: string | null;
    windowDays: 30;
    total: number | null;
    byChannel: ChannelCounts | null;
    byPlatform: PlatformCounts | null;
    bySource: Record<string, number> | null;
  };
};
```

- [ ] **Step 4: Implement strict GitHub aggregation**

In `src/lib/stats/github.ts`:

- Fetch `https://api.github.com/repos/adamgell/cmtraceopen` for `stargazers_count`.
- Fetch release pages with `per_page=100&page=N` until a page has fewer than 100 records.
- Require non-negative safe integers for stars and `download_count`.
- Include stable records only when `draft === false && prerelease === false`.
- Include the nightly record only when `draft === false && prerelease === true && tag_name === "nightly"`.
- Convert each asset name through `classifyAsset` and count only `manual-only` or `mixed-manual-update` roles on Windows, macOS, or Linux.
- Throw a generic local error for malformed provider data; never return raw provider bodies.

Use these exported constants and signature so later tasks can test the endpoints:

```ts
export const GITHUB_REPOSITORY_API =
  "https://api.github.com/repos/adamgell/cmtraceopen";

export async function readGithubStats(
  fetcher: typeof fetch = fetch,
): Promise<GithubStats>;
```

- [ ] **Step 5: Run the focused tests and commit**

Run:

```bash
npx vitest run --config vitest.config.ts tests/stats-github.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/stats/types.ts src/lib/stats/github.ts tests/stats-github.test.ts
git commit -m "feat: aggregate public GitHub stats"
```

---

### Task 2: Analytics Engine selection aggregation

**Files:**
- Create: `src/lib/stats/analytics.ts`
- Create: `tests/stats-analytics.test.ts`
- Modify: `src/lib/releases/classify.ts`
- Modify: `analytics/queries.sql`
- Modify: `analytics/schema.md`

**Interfaces:**
- Consumes: `SelectionStats` from `src/lib/stats/types.ts`.
- Produces: `readSelectionStats(accountId: string, token: string, fetcher?: typeof fetch): Promise<SelectionStats>`.

- [ ] **Step 1: Write failing tests for the SQL request and validated aggregation**

The success fixture must return Cloudflare's JSON shape:

```ts
{
  meta: [],
  data: [
    { channel: "stable", platform: "windows", source: "download-home", selections: 7 },
    { channel: "nightly", platform: "macos", source: "nightly-builds-page", selections: 3 },
  ],
  rows: 2,
}
```

Assert the request uses `POST`, `Authorization: Bearer analytics-token`, a `text/plain` body, `SUM(_sample_interval * double1)`, a trailing 30-day filter, `blob9 != 'unknown'`, and `FORMAT JSON`. Assert the result is:

```ts
expect(result).toEqual({
  windowDays: 30,
  total: 10,
  byChannel: { stable: 7, nightly: 3 },
  byPlatform: { windows: 7, macos: 3, linux: 0 },
  bySource: { "download-home": 7, "nightly-builds-page": 3 },
});
```

Add rejection tests for missing credentials, non-2xx responses, malformed JSON shapes, unsupported channel/platform/source values, negative/nonfinite counts, and provider error bodies containing a fake secret. The thrown public-facing error must not contain the response body or token.

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

```bash
npx vitest run --config vitest.config.ts tests/stats-analytics.test.ts
```

Expected: FAIL because `src/lib/stats/analytics.ts` does not exist.

- [ ] **Step 3: Implement the fixed SQL query and validator**

Export:

```ts
export const ANALYTICS_DATASET = "cmtraceopen_download_events";

export async function readSelectionStats(
  accountId: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<SelectionStats>;
```

The query body must be static except for no user-controlled values:

```sql
SELECT
  blob3 AS channel,
  blob5 AS platform,
  blob9 AS source,
  SUM(_sample_interval * double1) AS selections
FROM cmtraceopen_download_events
WHERE timestamp >= NOW() - INTERVAL '30' DAY
  AND blob9 != 'unknown'
GROUP BY channel, platform, source
ORDER BY selections DESC
FORMAT JSON
```

Export `SOURCE_LABELS` from `src/lib/releases/classify.ts`, preserving the same six values used by `normalizeSource`. Validate rows against the existing channel, platform, and exported source allowlists before summing them. Encode the account ID as one URL path segment and reject blank credentials before making a request.

- [ ] **Step 4: Document the scoped read credential**

Append the production 30-day public query to `analytics/queries.sql`. Append to `analytics/schema.md` that public stats use the SQL API with `Account | Account Analytics | Read`, the Worker secrets are `CLOUDFLARE_ACCOUNT_ID` and `ANALYTICS_READ_TOKEN`, and neither value is exposed to browser code.

- [ ] **Step 5: Run the focused tests and commit**

```bash
npx vitest run --config vitest.config.ts tests/stats-analytics.test.ts
git add src/lib/stats/analytics.ts tests/stats-analytics.test.ts src/lib/releases/classify.ts analytics/queries.sql analytics/schema.md
git commit -m "feat: query aggregate download selections"
```

Expected: PASS before the commit.

---

### Task 3: Cached first-party stats endpoint

**Files:**
- Create: `src/lib/stats/service.ts`
- Create: `tests/stats-service.test.ts`
- Modify: `src/worker/index.ts`
- Modify: `tests/worker.test.ts`

**Interfaces:**
- Consumes: `readGithubStats`, `readSelectionStats`, and `PublicStats`.
- Produces: `getPublicStats(request: Request, config: StatsConfig, dependencies?: StatsDependencies): Promise<{ status: number; stats: PublicStats }>`.
- Produces: product-host `GET /api/stats` and bodyless `HEAD /api/stats`.

- [ ] **Step 1: Write failing service tests for fresh, partial, stale, and unavailable snapshots**

Define this configuration in the test import contract:

```ts
export type StatsConfig = {
  cloudflareAccountId?: string;
  analyticsReadToken?: string;
};

export type StatsDependencies = {
  githubFetcher?: typeof fetch;
  analyticsFetcher?: typeof fetch;
  now?: () => Date;
};
```

Mock both provider functions and `caches.open`. Assert:

- A complete refresh returns HTTP status `200`, both statuses `fresh`, and stores one cache entry.
- A cached snapshot younger than one hour returns without provider calls.
- A GitHub failure plus successful Analytics query returns selection data and `github.status === "unavailable"` when no old GitHub data exists.
- A provider failure with a cached provider value younger than 24 hours returns that value with `status === "stale"` and its original `updatedAt`.
- Two provider failures without usable cache return status `503` with both providers unavailable.
- No thrown provider message or configured token appears in serialized `stats`.

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

```bash
npx vitest run --config vitest.config.ts tests/stats-service.test.ts
```

Expected: FAIL because `src/lib/stats/service.ts` does not exist.

- [ ] **Step 3: Implement snapshot freshness and stale-provider merge**

Use these exact durations:

```ts
const FRESH_MS = 60 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const CACHE_NAME = "cmtraceopen-public-stats";
const CACHE_PATH = "/.cmtraceopen-cache/public-stats";
```

The cached JSON is the same `PublicStats` contract returned publicly. Read it first, compare `generatedAt` to `now()`, and return it immediately when younger than one hour. Otherwise run providers independently with `Promise.allSettled`, preserve successful cached provider values for failures younger than 24 hours, mark them `stale`, and store any response containing at least one available provider with an internal `Cache-Control: public, max-age=86400`.

Do not depend on `stale-if-error`; Workers Cache `put()`/`match()` does not provide that behavior. Inspect timestamps and merge stale providers in application code. The outward `/api/stats` response uses `Cache-Control: public, max-age=300`; it must never expose the internal 24-hour lifetime to browsers. Cache freshness is per Cloudflare edge location rather than a globally strict single refresh.

- [ ] **Step 4: Write failing Worker route tests**

Extend `environment()` in `tests/worker.test.ts` with optional `GITHUB_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `ANALYTICS_READ_TOKEN` values. Add assertions for:

```ts
expect(await handleRequest(
  new Request("https://cmtraceopen.com/api/stats"),
  env,
  providerFetcher,
)).toMatchObject({ status: 200 });
```

Also assert HEAD has no body, POST returns the branded 404, the download hostname does not expose the product stats API, security headers remain present, and response JSON contains neither secret.

- [ ] **Step 5: Wire the endpoint into the product Worker**

Extend the existing local environment type:

```ts
type RuntimeEnv = Env & {
  GITHUB_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  ANALYTICS_READ_TOKEN?: string;
};
```

Handle `/api/stats` inside `handleProduct` before static assets. GET returns `Response.json(stats, { status, headers: { "Cache-Control": "public, max-age=300" } })`; HEAD returns identical status and headers with a null body. Pass `githubFetcher(env, fetcher)` as `githubFetcher` and the unwrapped `fetcher` as `analyticsFetcher`, so GitHub and Cloudflare credentials stay scoped to their exact hosts.

- [ ] **Step 6: Run service and Worker tests and commit**

```bash
npx vitest run --config vitest.config.ts tests/stats-service.test.ts tests/worker.test.ts
git add src/lib/stats/service.ts tests/stats-service.test.ts src/worker/index.ts tests/worker.test.ts
git commit -m "feat: serve cached public stats"
```

Expected: PASS.

---

### Task 4: Homepage evidence strip and `/stats/` ledger

**Files:**
- Create: `src/components/ProjectStats.astro`
- Create: `src/scripts/project-stats.ts`
- Create: `src/styles/stats.css`
- Create: `src/pages/stats.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/data/site.ts`
- Modify: `src/components/ProductFooter.astro`
- Modify: `tests/site.spec.ts`
- Modify: `tests/content.test.mjs`
- Modify: `tests/worker-browser.spec.ts`

**Interfaces:**
- Consumes: `GET /api/stats` and the `PublicStats` JSON contract.
- Produces: `<ProjectStats mode="summary" />` and `<ProjectStats mode="full" />`.

- [ ] **Step 1: Write failing static-content and browser tests**

Update `tests/content.test.mjs` to require `stats/index.html`, the `Stats` header/footer links, the methodology phrases `Aggregate project signals, not users or installations`, `current mutable nightly release`, and `30-day verified selections`. Replace the current homepage negative assertion against `GitHub stars` with the positive stats contract. Assert the homepage source order places `product-view` before `project-stats` and `project-stats` before the trust-contract section.

In `tests/site.spec.ts`, route `**/api/stats` to this fixture:

```ts
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
```

Assert the homepage shows `24.3K`, `229`, `84`, and `Explore project stats`; `/stats/` shows exact unabridged table values and all definitions; partial failure displays `Temporarily unavailable`; mobile has no horizontal document overflow; both pages are axe clean; reduced motion produces no count animation.

Extend `tests/worker-browser.spec.ts` to assert `/stats/` loads through Wrangler and its same-origin script may request `/api/stats` under the existing `connect-src 'self'` CSP.

- [ ] **Step 2: Run the content and UI tests and verify failure**

```bash
npm run test:content
npx playwright test tests/site.spec.ts --project=desktop
```

Expected: FAIL because the component, page, navigation, and script do not exist.

- [ ] **Step 3: Build the shared semantic component**

`ProjectStats.astro` accepts:

```ts
interface Props {
  mode: "summary" | "full";
}
```

Render initial `Loading…` text for values, a single polite live-status region, semantic definition lists for headline values, and semantic tables for full breakdowns. Add stable `data-stat` hooks for `package-total`, `stars`, `selection-total`, channel/platform rows, provider timestamps, and provider status. The summary includes the methodology note and `/stats/` link; the full mode includes all breakdown containers.

- [ ] **Step 4: Implement one client loader without animation**

`src/scripts/project-stats.ts` must:

- Fetch `/api/stats` once per page load with `Accept: application/json`.
- Validate the small public shape before reading values.
- Format summary totals with `Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })`.
- Format full values with `Intl.NumberFormat("en")`.
- Replace missing provider values with `Temporarily unavailable`.
- Render source labels through a fixed display-name map; never insert provider strings as HTML.
- Set values with `textContent` and create table rows with DOM methods.
- Preserve the static methodology if fetching or validation fails.

- [ ] **Step 5: Add the two surfaces and navigation**

- Import `ProjectStats` and `stats.css` into `src/pages/index.astro`; insert `<ProjectStats mode="summary" />` directly after the `product-view` section.
- Create `src/pages/stats.astro` with `ProductLayout`, a concise evidence-grid introduction, `<ProjectStats mode="full" />`, methodology, privacy link, repository link, and download-center link.
- Add `{ label: "Stats", href: "/stats/" }` to `NAV_ITEMS` before GitHub.
- Add `Stats` to `footerLinks` before Privacy.

- [ ] **Step 6: Style the approved evidence strip + ledger direction**

In `src/styles/stats.css`, use existing tokens only. The summary is a three-column ruled grid above 760px and one column below it. The full page uses readable ruled tables with an overflow wrapper local to each table, never page-level overflow. Use cyan only for labels, rules, and links. Add no animated counters; any transition must be disabled by the existing reduced-motion rules.

- [ ] **Step 7: Run UI, content, and build verification and commit**

```bash
npm run test:content
npx playwright test tests/site.spec.ts
npm run check
npm run build
git add src/components/ProjectStats.astro src/scripts/project-stats.ts src/styles/stats.css src/pages/stats.astro src/pages/index.astro src/data/site.ts src/components/ProductFooter.astro tests/site.spec.ts tests/content.test.mjs tests/worker-browser.spec.ts
git commit -m "feat: publish CMTrace Open project stats"
```

Expected: all commands PASS.

---

### Task 5: Full local verification and deployment readiness

**Files:**
- Modify only files required to correct failures introduced by Tasks 1-4.
- Modify: `README.md`

**Interfaces:**
- Consumes: the complete stats endpoint and UI.
- Produces: a locally verified, deployable Worker build with an explicit secret checklist.

- [ ] **Step 1: Document deployment configuration**

Add a `Public stats` subsection to `README.md` that lists the three required secret names without values, explains that `CLOUDFLARE_ACCOUNT_ID` and `ANALYTICS_READ_TOKEN` are server-side only, links `analytics/schema.md`, and includes the local endpoint smoke command. Do not add `.dev.vars` or any credential-bearing file.

- [ ] **Step 2: Run every automated suite**

```bash
npm run test:worker
npm run test
npm run test:e2e:worker
npm run check
npm run build
```

Expected: all commands PASS. Fix only regressions caused by the stats feature and rerun the failing command before continuing.

- [ ] **Step 3: Run a local Wrangler smoke test**

Start:

```bash
npm run preview:worker
```

Verify in another shell:

```bash
curl --resolve product.localhost:8787:127.0.0.1 http://product.localhost:8787/
curl --resolve product.localhost:8787:127.0.0.1 http://product.localhost:8787/stats/
curl --resolve product.localhost:8787:127.0.0.1 http://product.localhost:8787/api/stats
curl --resolve download.localhost:8787:127.0.0.1 http://download.localhost:8787/
```

Expected: product and stats pages return `200`; the stats endpoint returns either a structured local response or explicit `503` when local secrets are absent; the download chooser remains `200`.

- [ ] **Step 4: Confirm production secret prerequisites without printing values**

Use `wrangler secret list` and confirm these names exist before deployment:

```text
GITHUB_TOKEN
CLOUDFLARE_ACCOUNT_ID
ANALYTICS_READ_TOKEN
```

If either analytics secret is absent, stop before deployment and request that it be uploaded. Never print, export, or commit the secret values.

- [ ] **Step 5: Review the final diff and commit verification-only fixes**

```bash
git status --short
git diff --check
git log --oneline -6
```

If documentation or verification required source changes, stage only those files and commit:

```bash
git commit -m "test: complete public stats verification"
```

If no source changes were needed, do not create an empty commit.

- [ ] **Step 6: Stop before production mutation**

Report the passing commands, the exact local preview URLs, missing secret names if any, and the commit range. Do not deploy or push until the user explicitly approves production mutation.
