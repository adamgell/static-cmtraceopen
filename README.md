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

Running `npm run deploy` performs the same build and deployment locally when you are ready. Do not commit Cloudflare credentials or local `.env` files.
