# CMTrace Open website

Standalone Astro and Cloudflare Worker site for CMTrace Open. One Worker serves the product site, Field Guide, nightly builds, and the branded download surface.

## Local development

```sh
npm install
npm run dev
```

To preview the complete Worker locally, including the release APIs and both hostnames:

```sh
npm run preview:worker
```

- Product site: <http://localhost:8787/>
- Nightly builds: <http://localhost:8787/nightly/>

**Hostname routing cannot be exercised locally.** `wrangler dev` presents every request to the Worker as `localhost` regardless of the Host sent, so `surfaceFor()` always resolves to the `product` surface — the download and `cmtrace.net` shortlink surfaces are unreachable in local preview, and an unmapped hostname returns 200 rather than the Worker's 421. Verified against wrangler 4.110.0 with `curl -H "Host: ..."`, `--resolve`, and direct `*.localhost` requests.

Cover those surfaces with `npm run test:worker` instead. That suite runs inside workerd, constructs requests at explicit hostnames, and exercises the real Cache API — it is the only local check that proves hostname routing, redirects and cache behaviour. The Playwright worker suite does not: its assertions all land on product-surface pages or the branded 404, which the asset server serves anyway.

## Verification

```sh
npm run check          # astro check (types)
npm run test:worker    # workerd unit and integration tests
npm run test:content   # build plus content contract tests
npm run test:e2e       # Playwright, site
npm run test:e2e:worker # Playwright, worker preview
```

Those five commands are exactly what `.github/workflows/ci.yml` runs, split across two parallel jobs — **Types and worker tests** and **Browser end-to-end**. Run them before opening a pull request and CI should hold no surprises.

`main` is protected: direct pushes are rejected, changes land through a pull request, and both jobs must pass with the branch up to date before merge. This matters more than usual here because Cloudflare deploys straight from `main` without waiting for GitHub Actions — see below.

## Cloudflare

**Pushing to `main` deploys to production.** The repository is connected to Cloudflare Workers Builds, which builds and deploys on every push to `main` — there is no manual promotion step, and Cloudflare does not wait for GitHub Actions. That is why `main` is protected and changes land through a pull request: the CI gate in `.github/workflows/ci.yml` is the only thing standing between a commit and eleven live hostnames.

Workers Builds settings:

- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node.js version: read from `.node-version` (`22.12.0`)

`npm run deploy` performs the same build and deployment from a local checkout when you need to bypass the pipeline.

The Worker entry point, static assets, Analytics Engine binding, and compatibility date are defined in `wrangler.jsonc`. These custom domains are attached to the Worker:

- `cmtraceopen.com`
- `www.cmtraceopen.com`
- `download.cmtraceopen.com`
- `cmtrace.net`, `www.cmtrace.net`, `win.cmtrace.net`, `winarm.cmtrace.net`, `lite.cmtrace.net`, `mac.cmtrace.net`, `msi.cmtrace.net`, `nightly.cmtrace.net`

All of these zones live on the same Cloudflare account as the Worker (verify with `npx wrangler whoami`). Attaching a custom domain writes a DNS record, which the local OAuth login is not scoped for — the eight `cmtrace.net` domains were attached through the dashboard (Workers & Pages → the Worker → Domains → Add Domain), and `wrangler deploy` now reconciles against `wrangler.jsonc` without needing the permission. Add any future domain the same way.

Do not commit Cloudflare credentials or local `.env` files.

### cmtrace.net shortlinks

Memorable direct-download hostnames. Each resolves the latest release at request time and redirects straight to GitHub in one hop.

| Hostname | Target |
| --- | --- |
| `cmtrace.net`, `www.cmtrace.net` | 301 to `https://cmtraceopen.com/` |
| `win.cmtrace.net` | Windows x64 full portable EXE |
| `winarm.cmtrace.net` | Windows arm64 full portable EXE |
| `lite.cmtrace.net` | Windows x64 Lite portable EXE |
| `mac.cmtrace.net` | macOS arm64 DMG |
| `msi.cmtrace.net` | Windows x64 MSI |
| `nightly.cmtrace.net` | Nightly channel Windows x64 full portable EXE |

The latest release is resolved at request time because the artifact filenames embed the version, which GitHub's `/releases/latest/download/` alias cannot address. `GITHUB_TOKEN` is therefore effectively required rather than optional: without it, GitHub's unauthenticated limit of 60 requests per hour per IP is low enough that cold caches will start sending visitors to the chooser instead of the file.

When a release is missing the requested artifact, or GitHub is unavailable, the host redirects to the download chooser rather than dead-ending, and records no download event.

One known rough edge: the `nightly` tag is mutable and its assets are deleted and re-uploaded during each nightly build. A link resolved from a cache entry up to two minutes old can point at an asset GitHub has already replaced, giving the visitor GitHub's own 404. If that becomes a nuisance, change the `nightly` entry in `src/worker/shortlink.ts` to a `site` route pointing at `https://cmtraceopen.com/nightly/`.

### Public stats

The public stats endpoint requires these Worker secrets:

- `GITHUB_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ANALYTICS_READ_TOKEN`

`CLOUDFLARE_ACCOUNT_ID` and `ANALYTICS_READ_TOKEN` are server-side only and must never be exposed to browser code. See [the analytics schema](analytics/schema.md) for the aggregate download-event fields used by the endpoint.

With the local Worker preview running, smoke-test the endpoint with:

```sh
curl --resolve product.localhost:8787:127.0.0.1 http://product.localhost:8787/api/stats
```
