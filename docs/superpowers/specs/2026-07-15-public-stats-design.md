# Public Project Stats Design

## Goal

Add honest, privacy-preserving project statistics to CMTrace Open without cluttering the homepage hero or implying that aggregate counts represent people, installations, devices, or active users.

The website will present a compact summary on the homepage and a detailed public ledger at `/stats/`.

## Approved visual direction

Use the **Evidence strip + ledger** direction.

- Place a restrained `PROJECT SIGNAL` section immediately after the homepage product screenshot and before the trust section.
- Show three equally weighted headline figures: package downloads, GitHub stars, and verified download selections during the last 30 days.
- Link the strip to `/stats/` for definitions and breakdowns.
- Do not put counters beneath the product logo or inside the main hero.
- Match the existing dark evidence-grid design, cyan rules, technical labels, typography, and spacing.

## Public metric definitions

### Package downloads

The headline package-download total combines:

1. Human-installable package downloads across published stable GitHub releases.
2. Human-installable package downloads attached to the current mutable `nightly` release.

The stable and current-nightly values remain separately visible on `/stats/`.

The total includes assets classified as `manual-only` or `mixed-manual-update`. It excludes updater manifests, updater-only archives, detached signatures, SBOMs, unknown files, and other supporting assets.

The UI must call this number **package downloads reported by GitHub**. It must not call it users, installations, devices, adoption, or active users. The methodology must explain that the nightly portion covers assets currently attached to the mutable nightly release, not every historical nightly asset that has been replaced.

### GitHub stars

Show the repository's current `stargazers_count` from the GitHub repository API. Label it **GitHub stars**.

### Verified selections

Show aggregate uses of verified package links routed through `download.cmtraceopen.com` during the trailing 30 days.

- Include stable and nightly selections.
- Include only allowlisted project source labels.
- Exclude `unknown` source events so setup traffic and unrecognized direct requests do not enter the public figure.
- Keep this metric visibly distinct from GitHub downloads.
- Describe it as link selections, not completed downloads, installations, unique people, or active users.

The selection data contains no IP address, user-agent string, cookie, fingerprint, full referrer, persistent identifier, or application-runtime event.

## Page content

### Homepage

The homepage strip contains:

- Combined stable plus current-nightly package downloads.
- GitHub stars.
- Verified selections over 30 days.
- A short note: `Aggregate project signals, not users or installations.`
- A link to `/stats/` labeled `Explore project stats`.

If a metric is unavailable, show `Temporarily unavailable`; never substitute `0`.

### `/stats/`

The dedicated page contains:

1. The same three headline figures.
2. GitHub package downloads split into stable and current nightly.
3. GitHub package downloads split into Windows, macOS, and Linux.
4. Thirty-day verified selections split by stable/nightly channel.
5. Thirty-day verified selections split by Windows, macOS, and Linux.
6. Thirty-day verified selections split by allowlisted project source.
7. Per-provider update timestamps and availability status.
8. A methodology section defining every metric and its limitations.
9. Links to the GitHub repository, download center, and privacy statement.

Add `Stats` to the product navigation and footer. Tables must remain usable on narrow screens and must expose their values as text rather than relying on visual bars alone.

## Architecture

### Public endpoint

Add a read-only `GET /api/stats` route to the existing Cloudflare Worker. `HEAD` may return the same headers without a body. Other methods receive the site's normal not-found response.

The browser calls only this first-party endpoint. It never calls GitHub or Cloudflare APIs directly and never receives provider credentials.

The response contract contains:

- `generatedAt`
- `github.status` and `github.updatedAt`
- `github.stars`
- `github.packageDownloads.total`
- `github.packageDownloads.stable`
- `github.packageDownloads.currentNightly`
- `github.packageDownloads.byPlatform`
- `selections.status` and `selections.updatedAt`
- `selections.windowDays`
- `selections.total`
- `selections.byChannel`
- `selections.byPlatform`
- `selections.bySource`

Unavailable provider values are `null`, accompanied by an explicit provider status. The endpoint never returns fabricated zeroes.

### GitHub provider

Reuse the existing server-side `GITHUB_TOKEN`. Fetch repository metadata and paginate published releases. Reuse the existing asset-classification contract rather than introducing a second filename filter.

Draft releases are excluded. Stable releases and the release tagged `nightly` are aggregated separately before producing the combined total.

### Analytics Engine provider

Query the `cmtraceopen_download_events` dataset through the Cloudflare Analytics Engine SQL API. Store the Cloudflare account identifier and a narrowly scoped analytics-read token as Worker secrets named `CLOUDFLARE_ACCOUNT_ID` and `ANALYTICS_READ_TOKEN`.

Queries aggregate only the existing allowlisted dimensions over the trailing 30 days. No request-specific browser data is sent to the query service or added to the response.

### Caching

Use one canonical cache key for the complete stats response.

- A result is fresh for one hour.
- Retain a successful cached result for up to 24 hours so it can be served as stale data when a provider is temporarily unavailable.
- Preserve the original provider timestamps when serving stale data.
- Do not refresh data in response to every browser request.

The homepage and `/stats/` page consume the same endpoint and therefore display the same snapshot.

## Failure behavior

- If one provider fails, return the available provider data and mark the failed provider unavailable.
- If refresh fails and a cached snapshot is available, return that snapshot with its true timestamp and stale status.
- If no cached snapshot exists and both providers fail, return a structured `503` response. The pages show a quiet `Stats temporarily unavailable` state while the rest of the site remains fully usable.
- Provider errors and secret values must never be exposed in the public response.
- A stats failure must never affect release discovery, package redirects, download counting, or other product pages.

## Accessibility and progressive behavior

- Announce asynchronously loaded values without repeatedly disrupting screen readers.
- Use semantic headings, definition lists, and data tables.
- Provide readable loading and unavailable states.
- Do not encode platform or channel meaning through color alone.
- Keep the methodology accessible without JavaScript even if live values cannot load.
- Respect reduced-motion preferences and avoid animated count-up effects.

## Verification

Automated tests will cover:

- Human-package inclusion and supporting/updater-file exclusion.
- Stable, current-nightly, combined, and per-platform aggregation.
- Draft-release exclusion and GitHub pagination.
- Thirty-day Analytics Engine queries and exclusion of `unknown` sources.
- Complete, partial, stale, and unavailable endpoint responses.
- Cache freshness and 24-hour stale fallback.
- Rejection of unsupported methods.
- Confirmation that credentials and provider error details never enter responses.
- Homepage and `/stats/` loading, success, partial-failure, and unavailable states.
- Navigation, responsive layout, keyboard access, semantic tables, and reduced motion.

Before deployment, run the full Worker, site, browser, type-check, and production-build verification suites. Perform a local Wrangler smoke test for both product and download hostnames, then verify the live endpoint and both public pages after deployment.
