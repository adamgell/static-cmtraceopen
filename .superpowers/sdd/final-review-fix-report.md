# Public stats final-review fix report

Date: 2026-07-16
Baseline: `389cde34779f7ebd678d700520a0db8653533373`

## Scope completed

- Public Analytics Engine SQL now filters at query level to stable/nightly channels, Windows/macOS/Linux platforms, manual-only/mixed-manual-update delivery roles, and the six allowlisted public sources.
- Analytics response rows and every derived aggregate must be nonnegative safe integers.
- Public stats use one canonical synthetic cache URL for apex, `www`, and preview requests.
- Cache open, read, JSON validation, and write failures are best-effort and cannot replace successfully refreshed provider data.
- Worker coverage confirms cache unavailability still returns a structured public response.

## TDD evidence

Focused baseline before regression tests:

- `npx vitest run --config vitest.config.ts tests/stats-analytics.test.ts tests/stats-service.test.ts tests/worker.test.ts`
- 3 test files passed; 52 tests passed.

Red run after adding regressions and before source fixes:

- Same focused command.
- 3 test files failed; 9 tests failed and 54 tests passed.
- Expected failures covered the missing SQL allowlists, fractional/unsafe/overflowing Analytics counts, host-derived cache keys, cache-open and cache-write rejection, malformed cached shape, and Worker cache-open rejection.

Green run after implementation and final test tightening:

- Same focused command.
- 3 test files passed; 63 tests passed.
- `git diff --check` also passed.

## Required full verification

- `npm run test:worker`
  - Wrangler types generated successfully.
  - 8 test files passed; 206 tests passed.
- `npm run test`
  - Astro diagnostics: 46 files, 0 errors, 0 warnings, 0 hints.
  - Production build: 18 pages built.
  - Content tests: 7 passed.
  - Browser tests: 93 passed across desktop, tablet, and mobile projects.
- `npm run test:e2e:worker`
  - 3 Worker browser tests passed.
- `npm run check`
  - Astro diagnostics: 46 files, 0 errors, 0 warnings, 0 hints.
- `npm run build`
  - Astro diagnostics: 46 files, 0 errors, 0 warnings, 0 hints.
  - Production build: 18 pages built.

## Notes and concerns

- No blocking failures remain.
- Wrangler reported that 4.111.0 is available while the project ran 4.110.0; no dependency update was made.
- Playwright web-server processes emitted existing `NO_COLOR`/`FORCE_COLOR` warnings; all browser tests passed.
- `npm run test:worker` regenerated six whitespace-only lines in `src/worker-configuration.d.ts`; those unrelated generated changes were restored and are not part of this fix.
- Existing untracked `docs/social-media-launch-posts.md` and pre-existing `.superpowers` artifacts were not modified or staged.
