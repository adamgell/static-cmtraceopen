import { recordDownload } from "../lib/releases/analytics";
import { normalizeSource } from "../lib/releases/classify";
import {
  getNightlyRelease,
  getStableRelease,
  getVerifiedAsset,
  getVerifiedNightlyAsset,
} from "../lib/releases/github";
import { getPublicStats } from "../lib/stats/service";

export type Surface = "product" | "download" | "unknown";

type RuntimeEnv = Env & {
  GITHUB_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  ANALYTICS_READ_TOKEN?: string;
};

const PRODUCT_HOSTS = new Set([
  "cmtraceopen.com",
  "www.cmtraceopen.com",
  "static-cmtraceopen.acgell9959032.workers.dev",
  "localhost",
  "product.localhost",
]);
const DOWNLOAD_HOSTS = new Set([
  "download.cmtraceopen.com",
  "download.localhost",
]);

const PRODUCT_DOWNLOAD = "https://download.cmtraceopen.com/";
const ASSET_PATH = /^\/asset\/([1-9][0-9]*)\/?$/;
const NIGHTLY_ASSET_PATH = /^\/nightly-asset\/([1-9][0-9]*)\/?$/;
const DOWNLOAD_SHARED_ASSET = /^\/(?:_astro|images)\//;
const DOWNLOAD_SHARED_FILES = new Set([
  "/favicon.svg",
  "/robots.txt",
  "/site.webmanifest",
]);

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
} as const;

export function surfaceFor(hostname: string): Surface {
  const host = hostname.toLowerCase().split(":", 1)[0];
  if (PRODUCT_HOSTS.has(host)) return "product";
  if (DOWNLOAD_HOSTS.has(host)) return "download";
  return "unknown";
}

function secure(response: Response, status = response.status): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status,
    statusText: status === response.status ? response.statusText : undefined,
    headers,
  });
}

function redirect(location: string, noStore = false): Response {
  const headers = new Headers({ Location: location });
  if (noStore) headers.set("Cache-Control", "no-store");
  return secure(new Response(null, { status: 302, headers }));
}

function requestAt(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

function githubFetcher(env: RuntimeEnv, fetcher: typeof fetch): typeof fetch {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) return fetcher;

  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(input instanceof Request ? input.url : String(input));
    if (
      requestUrl.protocol !== "https:" ||
      requestUrl.hostname !== "api.github.com" ||
      requestUrl.port !== "" ||
      requestUrl.username !== "" ||
      requestUrl.password !== ""
    ) {
      return fetcher(input, init);
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    for (const [name, value] of new Headers(init?.headers)) {
      headers.set(name, value);
    }
    headers.set("Authorization", `Bearer ${token}`);
    return fetcher(input, { ...init, headers });
  }) as typeof fetch;
}

async function brandedNotFound(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = "/404/";
  const response = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
  return secure(response, 404);
}

async function handleProduct(
  request: Request,
  env: RuntimeEnv,
  url: URL,
  githubApiFetcher: typeof fetch,
  fetcher: typeof fetch,
): Promise<Response> {
  if (url.pathname === "/download" || url.pathname === "/download/") {
    return redirect(PRODUCT_DOWNLOAD);
  }
  if (request.method === "GET" && url.pathname === "/api/releases/nightly") {
    try {
      return secure(Response.json(await getNightlyRelease(request, githubApiFetcher)));
    } catch {
      return secure(Response.json({ error: "Nightly release unavailable." }, { status: 503 }));
    }
  }
  if (url.pathname === "/api/stats") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return brandedNotFound(request, env);
    }

    const { status, stats } = await getPublicStats(
      request,
      {
        cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
        analyticsReadToken: env.ANALYTICS_READ_TOKEN,
      },
      {
        githubFetcher: githubApiFetcher,
        analyticsFetcher: fetcher,
      },
    );
    const response = Response.json(stats, {
      status,
      headers: { "Cache-Control": "public, max-age=300" },
    });
    if (request.method === "HEAD") {
      return secure(new Response(null, {
        status,
        headers: response.headers,
      }));
    }
    return secure(response);
  }
  return secure(await env.ASSETS.fetch(request));
}

async function handleDownload(
  request: Request,
  env: Env,
  url: URL,
  fetcher: typeof fetch,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return brandedNotFound(request, env);
  }

  if (url.pathname === "/") {
    return secure(await env.ASSETS.fetch(requestAt(request, "/_download/")));
  }

  if (request.method === "GET" && url.pathname === "/api/releases/stable") {
    try {
      return secure(Response.json(await getStableRelease(request, fetcher)));
    } catch {
      return secure(Response.json({ error: "Stable release unavailable." }, { status: 503 }));
    }
  }

  if (request.method === "GET" && url.pathname.startsWith("/asset/")) {
    const match = ASSET_PATH.exec(url.pathname);
    if (!match) return brandedNotFound(request, env);

    const id = Number(match[1]);
    try {
      const asset = await getVerifiedAsset(id, request, fetcher);
      const source = normalizeSource(url.searchParams.get("source"));
      recordDownload(env.DOWNLOAD_EVENTS, asset, source);
      return redirect(asset.browserDownloadUrl, true);
    } catch {
      return brandedNotFound(request, env);
    }
  }

  if (request.method === "GET" && url.pathname.startsWith("/nightly-asset/")) {
    const match = NIGHTLY_ASSET_PATH.exec(url.pathname);
    if (!match) return brandedNotFound(request, env);

    const id = Number(match[1]);
    try {
      const asset = await getVerifiedNightlyAsset(id, request, fetcher);
      const source = normalizeSource(url.searchParams.get("source"));
      recordDownload(env.DOWNLOAD_EVENTS, asset, source);
      return redirect(asset.browserDownloadUrl, true);
    } catch {
      return brandedNotFound(request, env);
    }
  }

  if (
    DOWNLOAD_SHARED_ASSET.test(url.pathname) ||
    DOWNLOAD_SHARED_FILES.has(url.pathname)
  ) {
    return secure(await env.ASSETS.fetch(request));
  }

  return brandedNotFound(request, env);
}

export async function handleRequest(
  request: Request,
  env: RuntimeEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const surface = surfaceFor(url.hostname);
  const releaseFetcher = githubFetcher(env, fetcher);

  if (surface === "product") {
    return handleProduct(request, env, url, releaseFetcher, fetcher);
  }
  if (surface === "download") return handleDownload(request, env, url, releaseFetcher);
  return secure(new Response("Misdirected request", { status: 421 }));
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
