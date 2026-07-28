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

- Product site: <http://product.localhost:8787/>
- Download site: <http://download.localhost:8787/>
- Nightly builds: <http://product.localhost:8787/nightly/>
- Shortlinks: <http://win.cmtrace.localhost:8787/> and the other hosts in the table below, with `cmtrace.localhost` standing in for `cmtrace.net`

## Verification

```sh
npm test
npm run test:e2e:worker
npm run test:worker
```

## Cloudflare

Connect this repository to Cloudflare Workers with these build settings:

- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node.js version: `22.12.0`

The Worker entry point, static assets, Analytics Engine binding, and compatibility date are defined in `wrangler.jsonc`. After the Worker is connected, attach these custom domains in Cloudflare:

- `cmtraceopen.com`
- `www.cmtraceopen.com`
- `download.cmtraceopen.com`
- `cmtrace.net`, `www.cmtrace.net`, `win.cmtrace.net`, `winarm.cmtrace.net`, `lite.cmtrace.net`, `mac.cmtrace.net`, `msi.cmtrace.net`, `nightly.cmtrace.net`

The `cmtrace.net` zone must be on the same Cloudflare account as the Worker; check with `npx wrangler whoami` before the first deploy. Attaching a custom domain writes DNS, so the deploy token needs `Zone:DNS:Edit` on that zone — if the git-integration deploy fails, attach the eight domains once through the dashboard and subsequent deploys reconcile against `wrangler.jsonc` without needing the permission.

Running `npm run deploy` performs the same build and deployment locally when you are ready. Do not commit Cloudflare credentials or local `.env` files.

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
