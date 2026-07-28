import { afterEach, describe, expect, it, vi } from "vitest";

import { handleRequest, surfaceFor } from "../src/worker/index";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
} as const;

const ASSET = {
  id: 475711960,
  name: "CMTrace-Open_1.4.0_x64.exe",
  size: 23_561_984,
  content_type: "application/x-msdownload",
  browser_download_url:
    "https://github.com/adamgell/cmtraceopen/releases/download/v1.4.0/CMTrace-Open_1.4.0_x64.exe",
};

const STABLE_RELEASE = {
  tag_name: "v1.4.0",
  name: "CMTrace Open v1.4.0",
  published_at: "2026-07-01T12:00:00Z",
  html_url: "https://github.com/adamgell/cmtraceopen/releases/tag/v1.4.0",
  draft: false,
  prerelease: false,
  assets: [ASSET],
};

const NIGHTLY_ASSET = {
  id: 475898689,
  name: "CMTrace-Open_Nightly_20260713_75_efb9803c9f91_x64.exe",
  size: 23_564_032,
  content_type: "application/octet-stream",
  browser_download_url:
    "https://github.com/adamgell/cmtraceopen/releases/download/nightly/CMTrace-Open_Nightly_20260713_75_efb9803c9f91_x64.exe",
};

const NIGHTLY_RELEASE = {
  tag_name: "nightly",
  name: "CMTrace Open Nightly",
  published_at: "2026-07-01T12:00:00Z",
  html_url: "https://github.com/adamgell/cmtraceopen/releases/tag/nightly",
  draft: false,
  prerelease: true,
  assets: [{
    ...NIGHTLY_ASSET,
    created_at: "2026-07-13T21:20:00Z",
    updated_at: "2026-07-13T21:30:00Z",
  }],
};

type AssetFetcher = ReturnType<typeof vi.fn>;

function assetBinding(): AssetFetcher {
  return vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    if (url.pathname === "/_download/") {
      return new Response("<h1>Download CMTrace Open</h1>", {
        headers: { "Content-Type": "text/html" },
      });
    }
    if (url.pathname === "/404/") {
      return new Response("<h1>This route dropped out of the timeline.</h1>", {
        headers: { "Content-Type": "text/html" },
      });
    }
    if (url.pathname === "/") {
      return new Response("<h1>Windows logs shouldn’t require archaeology.</h1>", {
        headers: { "Content-Type": "text/html" },
      });
    }
    if (url.pathname === "/nightly/") {
      return new Response("<h1>Builds from main, ready for testing.</h1>", {
        headers: { "Content-Type": "text/html" },
      });
    }
    return new Response("static asset", { status: 200 });
  });
}

function environment(
  assets = assetBinding(),
  writeDataPoint: ReturnType<typeof vi.fn> = vi.fn(),
  values: {
    GITHUB_TOKEN?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
    ANALYTICS_READ_TOKEN?: string;
  } = {},
): { env: Env; assets: AssetFetcher; writeDataPoint: ReturnType<typeof vi.fn> } {
  return {
    env: {
      ASSETS: { fetch: assets },
      DOWNLOAD_EVENTS: { writeDataPoint },
      ...values,
    } as unknown as Env,
    assets,
    writeDataPoint,
  };
}

function githubFetcher(
  assetResponse: Response = Response.json(ASSET),
  releaseResponse: Response = Response.json(STABLE_RELEASE),
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/releases/assets/${ASSET.id}`)) return assetResponse.clone();
    if (url.endsWith("/releases/latest")) return releaseResponse.clone();
    throw new Error(`Unexpected GitHub URL: ${url}`);
  }) as unknown as typeof fetch;
}

function nightlyGithubFetcher(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/releases/assets/${NIGHTLY_ASSET.id}`)) return Response.json(NIGHTLY_ASSET);
    if (url.endsWith("/releases/tags/nightly")) return Response.json(NIGHTLY_RELEASE);
    throw new Error(`Unexpected GitHub URL: ${url}`);
  }) as unknown as typeof fetch;
}

const SHORTLINK_TAG = "v1.5.0";
const SHORTLINK_NAMES = [
  "CMTrace-Open_1.5.0_x64.exe",
  "CMTrace-Open_1.5.0_arm64.exe",
  "CMTrace-Open-Lite_1.5.0_x64.exe",
  "CMTrace-Open_1.5.0_x64-setup.exe",
  "CMTrace-Open_1.5.0_x64.msi",
  "CMTrace.Open_1.5.0_aarch64.dmg",
];

function githubAsset(name: string, id: number, tag = SHORTLINK_TAG) {
  return {
    id,
    name,
    size: 1024,
    content_type: "application/octet-stream",
    browser_download_url: `https://github.com/adamgell/cmtraceopen/releases/download/${tag}/${name}`,
  };
}

function shortlinkRelease(names: string[] = SHORTLINK_NAMES) {
  return {
    tag_name: SHORTLINK_TAG,
    name: "CMTrace Open v1.5.0",
    published_at: "2026-07-27T12:00:00Z",
    html_url: `https://github.com/adamgell/cmtraceopen/releases/tag/${SHORTLINK_TAG}`,
    draft: false,
    prerelease: false,
    assets: names.map((name, index) => githubAsset(name, 5000 + index)),
  };
}

const SHORTLINK_NIGHTLY_NAME = "CMTrace-Open_Nightly_20260728_412_efb9803c9f91_x64.exe";
const SHORTLINK_NIGHTLY_RELEASE = {
  tag_name: "nightly",
  name: "CMTrace Open Nightly",
  published_at: "2026-07-28T07:00:00Z",
  html_url: "https://github.com/adamgell/cmtraceopen/releases/tag/nightly",
  draft: false,
  prerelease: true,
  assets: [{
    ...githubAsset(SHORTLINK_NIGHTLY_NAME, 5100, "nightly"),
    created_at: "2026-07-28T07:20:00Z",
    updated_at: "2026-07-28T07:30:00Z",
  }],
};

function shortlinkGithubFetcher(
  stableResponse: () => Response = () => Response.json(shortlinkRelease()),
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/releases/latest")) return stableResponse();
    if (url.endsWith("/releases/tags/nightly")) return Response.json(SHORTLINK_NIGHTLY_RELEASE);
    throw new Error(`Unexpected GitHub URL: ${url}`);
  }) as unknown as typeof fetch;
}

function downloadUrl(name: string, tag = SHORTLINK_TAG): string {
  return `https://github.com/adamgell/cmtraceopen/releases/download/${tag}/${name}`;
}

function expectSecurityHeaders(response: Response): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(response.headers.get(name), name).toBe(value);
  }
}

function emptyStatsCache(): void {
  vi.spyOn(caches, "open").mockResolvedValue({
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  } as unknown as Cache);
}

function statsProviderFetcher(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);

    if (url.href === "https://api.github.com/repos/adamgell/cmtraceopen") {
      return Response.json({ stargazers_count: 42 });
    }
    if (
      url.origin === "https://api.github.com" &&
      url.pathname === "/repos/adamgell/cmtraceopen/releases"
    ) {
      return Response.json([]);
    }
    if (
      url.origin === "https://api.cloudflare.com" &&
      url.pathname === "/client/v4/accounts/account-id/analytics_engine/sql"
    ) {
      return Response.json({
        meta: [],
        data: [{
          channel: "stable",
          platform: "windows",
          source: "download-home",
          selections: 7,
        }],
        rows: 1,
      });
    }
    throw new Error(`Unexpected stats provider URL: ${url.href}`);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hostname and static surface routing", () => {
  it("serves the product flagship from the product hostname", async () => {
    const request = new Request("https://cmtraceopen.com/");
    const { env, assets } = environment();

    const response = await handleRequest(request, env);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Windows logs shouldn’t require archaeology.");
    expect(assets).toHaveBeenCalledOnce();
    expect((assets.mock.calls[0][0] as Request).url).toBe(request.url);
    expectSecurityHeaders(response);
  });

  it("serves the internal chooser at the download root without exposing its build path", async () => {
    const { env, assets } = environment();

    const response = await handleRequest(
      new Request("https://download.cmtraceopen.com/?source=github-readme"),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Download CMTrace Open");
    const internal = new URL((assets.mock.calls[0][0] as Request).url);
    expect(internal.pathname).toBe("/_download/");
    expect(internal.search).toBe("?source=github-readme");
    expect(response.headers.get("Location")).toBeNull();
    expectSecurityHeaders(response);
  });

  it.each(["/_astro/download.css", "/images/cmtrace-logo.png", "/favicon.svg", "/site.webmanifest"])(
    "serves the chooser's shared static asset %s on the download hostname",
    async (path) => {
      const { env, assets } = environment();
      const request = new Request(`https://download.cmtraceopen.com${path}`);

      const response = await handleRequest(request, env);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("static asset");
      expect((assets.mock.calls[0][0] as Request).url).toBe(request.url);
      expectSecurityHeaders(response);
    },
  );

  it.each([
    ["/download/", "https://download.cmtraceopen.com/"],
  ])("redirects the product route %s to its exact retained destination", async (path, location) => {
    const { env, assets } = environment();

    const response = await handleRequest(new Request(`https://cmtraceopen.com${path}`), env);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(location);
    expect(assets).not.toHaveBeenCalled();
    expectSecurityHeaders(response);
  });

  it("serves the native nightly page from the product hostname", async () => {
    const { env, assets } = environment();
    const response = await handleRequest(new Request("https://cmtraceopen.com/nightly/"), env);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Builds from main, ready for testing.");
    expect((assets.mock.calls[0][0] as Request).url).toBe("https://cmtraceopen.com/nightly/");
    expectSecurityHeaders(response);
  });

  it("serves the product from the exact Cloudflare preview hostname", async () => {
    const { env, assets } = environment();
    const request = new Request("https://static-cmtraceopen.acgell9959032.workers.dev/");

    const response = await handleRequest(request, env);

    expect(response.status).toBe(200);
    expect((assets.mock.calls[0][0] as Request).url).toBe(request.url);
    expectSecurityHeaders(response);
  });

  it("returns 421 for an unknown URL hostname without consulting request headers", async () => {
    const { env, assets } = environment();
    const request = new Request("https://unknown.example/", {
      headers: { Host: "cmtraceopen.com", "X-Forwarded-Host": "download.cmtraceopen.com" },
    });

    const response = await handleRequest(request, env);

    expect(response.status).toBe(421);
    expect(assets).not.toHaveBeenCalled();
    expectSecurityHeaders(response);
  });

  it("returns a branded 404 for product-only routes on the download hostname", async () => {
    const { env, assets } = environment();

    const response = await handleRequest(
      new Request("https://download.cmtraceopen.com/guides/"),
      env,
    );
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).toContain("This route dropped out of the timeline.");
    expect(body).not.toContain("/_download/");
    expect(new URL((assets.mock.calls[0][0] as Request).url).pathname).toBe("/404/");
    expectSecurityHeaders(response);
  });
});

describe("stable release API", () => {
  it("returns server-normalized stable release JSON", async () => {
    const { env } = environment();
    const response = await handleRequest(
      new Request("https://download.localhost:8601/api/releases/stable"),
      env,
      githubFetcher(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      tag: "v1.4.0",
      assets: [{
        id: ASSET.id,
        name: ASSET.name,
        platform: "windows",
        architecture: "x64",
        packageType: "portable-exe",
        deliveryRole: "manual-only",
      }],
    });
    expectSecurityHeaders(response);
  });
});

describe("nightly release API", () => {
  it("returns server-normalized nightly release JSON on the product host", async () => {
    const { env } = environment();
    const response = await handleRequest(
      new Request("https://product.localhost:8602/api/releases/nightly"),
      env,
      nightlyGithubFetcher(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tag: "nightly",
      publishedAt: "2026-07-13T21:30:00Z",
      assets: [{ id: NIGHTLY_ASSET.id, channel: "nightly", platform: "windows" }],
    });
    expectSecurityHeaders(response);
  });

  it("uses the optional GitHub token only as an API authorization header", async () => {
    const { env } = environment();
    const token = "test-token-that-must-stay-private";
    (env as Env & { GITHUB_TOKEN?: string }).GITHUB_TOKEN = token;
    const fetcher = vi.fn(async () => Response.json(NIGHTLY_RELEASE));

    const response = await handleRequest(
      new Request("https://product.localhost:8642/api/releases/nightly"),
      env,
      fetcher as unknown as typeof fetch,
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
    const [input, init] = fetcher.mock.calls[0];
    expect(String(input)).toBe(
      "https://api.github.com/repos/adamgell/cmtraceopen/releases/tags/nightly",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(await response.text()).not.toContain(token);
  });
});

describe("public stats API", () => {
  it("serves product stats with short public caching and host-scoped credentials", async () => {
    emptyStatsCache();
    const githubToken = "github-secret-that-must-stay-private";
    const analyticsToken = "analytics-secret-that-must-stay-private";
    const { env, assets } = environment(assetBinding(), vi.fn(), {
      GITHUB_TOKEN: githubToken,
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      ANALYTICS_READ_TOKEN: analyticsToken,
    });
    const providerFetcher = statsProviderFetcher();

    const response = await handleRequest(
      new Request("https://cmtraceopen.com/api/stats"),
      env,
      providerFetcher,
    );
    const body = await response.text();

    expect(response).toMatchObject({ status: 200 });
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(body).not.toContain(githubToken);
    expect(body).not.toContain(analyticsToken);
    expect(JSON.parse(body)).toMatchObject({
      github: { status: "fresh", stars: 42 },
      selections: { status: "fresh", total: 7 },
    });
    expect(assets).not.toHaveBeenCalled();
    expectSecurityHeaders(response);

    const calls = vi.mocked(providerFetcher).mock.calls.map(([input, init]) => ({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization"),
    }));
    expect(calls.filter(({ url }) => url.startsWith("https://api.github.com/")))
      .toEqual([
        expect.objectContaining({ authorization: `Bearer ${githubToken}` }),
        expect.objectContaining({ authorization: `Bearer ${githubToken}` }),
      ]);
    expect(calls.filter(({ url }) => url.startsWith("https://api.cloudflare.com/")))
      .toEqual([
        expect.objectContaining({ authorization: `Bearer ${analyticsToken}` }),
      ]);
  });

  it("returns a bodyless HEAD response with the GET status and headers", async () => {
    emptyStatsCache();
    const { env } = environment(assetBinding(), vi.fn(), {
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      ANALYTICS_READ_TOKEN: "analytics-token",
    });

    const response = await handleRequest(
      new Request("https://cmtraceopen.com/api/stats", { method: "HEAD" }),
      env,
      statsProviderFetcher(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(await response.text()).toBe("");
    expectSecurityHeaders(response);
  });

  it("returns structured provider data when the Worker cache is unavailable", async () => {
    vi.spyOn(caches, "open").mockRejectedValue(new Error("cache unavailable"));
    const { env } = environment(assetBinding(), vi.fn(), {
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      ANALYTICS_READ_TOKEN: "analytics-token",
    });

    const response = await handleRequest(
      new Request("https://cmtraceopen.com/api/stats"),
      env,
      statsProviderFetcher(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      github: { status: "fresh", stars: 42 },
      selections: { status: "fresh", total: 7 },
    });
    expectSecurityHeaders(response);
  });

  it("returns the branded 404 for POST on the product stats route", async () => {
    const { env, assets } = environment();
    const response = await handleRequest(
      new Request("https://cmtraceopen.com/api/stats", { method: "POST" }),
      env,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This route dropped out of the timeline.");
    const assetRequest = assets.mock.calls[0][0] as Request;
    expect(new URL(assetRequest.url).pathname).toBe("/404/");
    expect(assetRequest.method).toBe("GET");
    expectSecurityHeaders(response);
  });

  it("does not expose the product stats API on the download hostname", async () => {
    const { env, assets } = environment();
    const response = await handleRequest(
      new Request("https://download.cmtraceopen.com/api/stats"),
      env,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This route dropped out of the timeline.");
    expect(new URL((assets.mock.calls[0][0] as Request).url).pathname).toBe("/404/");
    expectSecurityHeaders(response);
  });
});

describe("verified asset redirects", () => {
  it.each(["not-a-number", "0", "01", "-1", "1.5", "1/extra"])(
    "rejects the non-positive-numeric asset path %s before GitHub or analytics",
    async (id) => {
      const { env, writeDataPoint } = environment();
      const fetcher = vi.fn();

      const response = await handleRequest(
        new Request(`https://download.localhost:8610/asset/${id}?source=github-readme`),
        env,
        fetcher as unknown as typeof fetch,
      );

      expect(response.status).toBe(404);
      expect(fetcher).not.toHaveBeenCalled();
      expect(writeDataPoint).not.toHaveBeenCalled();
      expectSecurityHeaders(response);
    },
  );

  it.each([
    ["unknown asset", Response.json({ message: "Not Found" }, { status: 404 })],
    ["GitHub failure", Response.json({ message: "Unavailable" }, { status: 503 })],
    [
      "cross-repository asset",
      Response.json({
        ...ASSET,
        browser_download_url:
          "https://github.com/other/repository/releases/download/v1.4.0/CMTrace-Open_1.4.0_x64.exe",
      }),
    ],
  ])("returns 404 without analytics for a %s", async (_label, assetResponse) => {
    const { env, writeDataPoint } = environment();
    const response = await handleRequest(
      new Request(`https://download.localhost:8620/asset/${ASSET.id}?source=github-readme`),
      env,
      githubFetcher(assetResponse),
    );

    expect(response.status).toBe(404);
    expect(writeDataPoint).not.toHaveBeenCalled();
    expectSecurityHeaders(response);
  });

  it("records one allowlisted event only after verification and redirects to the exact GitHub target", async () => {
    const { env, writeDataPoint } = environment();

    const response = await handleRequest(
      new Request(`https://download.localhost:8630/asset/${ASSET.id}?source=github-readme`),
      env,
      githubFetcher(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(ASSET.browser_download_url);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint.mock.calls[0][0].blobs.at(-1)).toBe("github-readme");
    expectSecurityHeaders(response);
  });

  it("verifies a current nightly asset before redirecting and counting it", async () => {
    const { env, writeDataPoint } = environment();
    const response = await handleRequest(
      new Request(`https://download.localhost:8631/nightly-asset/${NIGHTLY_ASSET.id}?source=nightly-builds-page`),
      env,
      nightlyGithubFetcher(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(NIGHTLY_ASSET.browser_download_url);
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint.mock.calls[0][0].blobs).toContain("nightly");
    expect(writeDataPoint.mock.calls[0][0].blobs.at(-1)).toBe("nightly-builds-page");
    expectSecurityHeaders(response);
  });

  it("normalizes source at the request boundary and never reads or logs request metadata", async () => {
    const writeDataPoint = vi.fn(() => {
      throw new Error("analytics unavailable");
    });
    const { env } = environment(assetBinding(), writeDataPoint);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handleRequest(
      new Request(
        `https://download.localhost:8640/asset/${ASSET.id}?source=person-private&target=https://evil.example/`,
        {
          headers: {
            "CF-Connecting-IP": "203.0.113.9",
            Cookie: "visitor=private",
            Referer: "https://private.example/person/42",
            "User-Agent": "private-browser-agent",
          },
        },
      ),
      env,
      githubFetcher(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(ASSET.browser_download_url);
    expect(writeDataPoint).toHaveBeenCalledOnce();
    const event = writeDataPoint.mock.calls[0][0];
    expect(event.blobs.at(-1)).toBe("unknown");
    expect(JSON.stringify(event)).not.toMatch(/203\.0\.113\.9|private-browser-agent|private\.example|evil\.example|person-private/);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expectSecurityHeaders(response);
  });
});

describe("cmtrace.net shortlink surface", () => {
  it.each([
    ["win", "CMTrace-Open_1.5.0_x64.exe"],
    ["winarm", "CMTrace-Open_1.5.0_arm64.exe"],
    ["lite", "CMTrace-Open-Lite_1.5.0_x64.exe"],
    ["mac", "CMTrace.Open_1.5.0_aarch64.dmg"],
    ["msi", "CMTrace-Open_1.5.0_x64.msi"],
  ])("redirects %s straight to the latest %s", async (host, name) => {
    const { env, writeDataPoint } = environment();

    const response = await handleRequest(
      new Request(`https://${host}.cmtrace.localhost:8650/`),
      env,
      shortlinkGithubFetcher(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(downloadUrl(name));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint.mock.calls[0][0].blobs).toContain(name);
    expect(writeDataPoint.mock.calls[0][0].blobs.at(-1)).toBe("cmtrace-net");
    expectSecurityHeaders(response);
  });

  it.each([
    ["win", "CMTrace-Open_1.5.0_x64.exe", ["CMTrace-Open-Lite_1.5.0_x64.exe", "CMTrace-Open_1.5.0_x64-setup.exe"]],
    ["lite", "CMTrace-Open-Lite_1.5.0_x64.exe", ["CMTrace-Open_1.5.0_x64.exe"]],
  ])("never confuses the %s edition with a same-extension sibling", async (host, expected, forbidden) => {
    const { env } = environment();

    const response = await handleRequest(
      new Request(`https://${host}.cmtrace.localhost:8651/`),
      env,
      shortlinkGithubFetcher(),
    );

    expect(response.headers.get("Location")).toBe(downloadUrl(expected));
    for (const name of forbidden) {
      expect(response.headers.get("Location")).not.toBe(downloadUrl(name));
    }
  });

  it("resolves the nightly host against the nightly channel", async () => {
    const { env, writeDataPoint } = environment();

    const response = await handleRequest(
      new Request("https://nightly.cmtrace.localhost:8652/"),
      env,
      shortlinkGithubFetcher(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(downloadUrl(SHORTLINK_NIGHTLY_NAME, "nightly"));
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint.mock.calls[0][0].blobs).toContain("nightly");
    expect(writeDataPoint.mock.calls[0][0].blobs.at(-1)).toBe("cmtrace-net");
  });

  it("falls back to the chooser without counting when the architecture did not build", async () => {
    const { env, writeDataPoint } = environment();
    const withoutArm64 = shortlinkRelease(
      SHORTLINK_NAMES.filter((name) => name !== "CMTrace-Open_1.5.0_arm64.exe"),
    );

    const response = await handleRequest(
      new Request("https://winarm.cmtrace.localhost:8653/"),
      env,
      shortlinkGithubFetcher(() => Response.json(withoutArm64)),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://download.cmtraceopen.com/?source=cmtrace-net",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(writeDataPoint).not.toHaveBeenCalled();
    expectSecurityHeaders(response);
  });

  it("falls back to the chooser without counting when GitHub is unavailable", async () => {
    const { env, writeDataPoint } = environment();

    const response = await handleRequest(
      new Request("https://win.cmtrace.localhost:8654/"),
      env,
      shortlinkGithubFetcher(() => Response.json({ message: "Unavailable" }, { status: 503 })),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://download.cmtraceopen.com/?source=cmtrace-net",
    );
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("refuses to guess when two assets share a classification", async () => {
    const { env, writeDataPoint } = environment();
    const ambiguous = shortlinkRelease([...SHORTLINK_NAMES, "CMTrace-Open_1.5.1_x64.exe"]);

    const response = await handleRequest(
      new Request("https://win.cmtrace.localhost:8655/"),
      env,
      shortlinkGithubFetcher(() => Response.json(ambiguous)),
    );

    expect(response.headers.get("Location")).toBe(
      "https://download.cmtraceopen.com/?source=cmtrace-net",
    );
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("shares one release cache entry across every shortlink host on the zone", async () => {
    const { env } = environment();
    const fetcher = shortlinkGithubFetcher();

    const first = await handleRequest(
      new Request("https://win.cmtrace.localhost:8656/"),
      env,
      fetcher,
    );
    const second = await handleRequest(
      new Request("https://mac.cmtrace.localhost:8656/"),
      env,
      fetcher,
    );

    expect(first.headers.get("Location")).toBe(downloadUrl("CMTrace-Open_1.5.0_x64.exe"));
    expect(second.headers.get("Location")).toBe(downloadUrl("CMTrace.Open_1.5.0_aarch64.dmg"));
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each(["cmtrace.localhost:8657", "www.cmtrace.localhost:8657"])(
    "sends %s to the product site with a revocable permanent redirect",
    async (host) => {
      const { env, assets, writeDataPoint } = environment();
      const fetcher = vi.fn();

      const response = await handleRequest(
        new Request(`https://${host}/`),
        env,
        fetcher as unknown as typeof fetch,
      );

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe("https://cmtraceopen.com/");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
      expect(fetcher).not.toHaveBeenCalled();
      expect(assets).not.toHaveBeenCalled();
      expect(writeDataPoint).not.toHaveBeenCalled();
      expectSecurityHeaders(response);
    },
  );

  it("ignores the path and query so a pasted link with tracking params still works", async () => {
    const { env } = environment();

    const response = await handleRequest(
      new Request("https://win.cmtrace.localhost:8658/download/?utm_source=slack&source=github-readme"),
      env,
      shortlinkGithubFetcher(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(downloadUrl("CMTrace-Open_1.5.0_x64.exe"));
  });

  it("keeps crawlers out of the installers", async () => {
    const { env, assets, writeDataPoint } = environment();
    const fetcher = vi.fn();

    const response = await handleRequest(
      new Request("https://win.cmtrace.localhost:8658/robots.txt"),
      env,
      fetcher as unknown as typeof fetch,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(fetcher).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
    expect(writeDataPoint).not.toHaveBeenCalled();
    expectSecurityHeaders(response);
  });

  it("answers the browser favicon probe without serving an installer", async () => {
    const { env, writeDataPoint } = environment();
    const fetcher = vi.fn();

    const response = await handleRequest(
      new Request("https://win.cmtrace.localhost:8658/favicon.ico"),
      env,
      fetcher as unknown as typeof fetch,
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(fetcher).not.toHaveBeenCalled();
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("rejects a write method before resolving a release or counting anything", async () => {
    const { env, assets, writeDataPoint } = environment();
    const fetcher = vi.fn();

    const response = await handleRequest(
      new Request("https://win.cmtrace.localhost:8659/", { method: "POST" }),
      env,
      fetcher as unknown as typeof fetch,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
    expect(fetcher).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
    expect(writeDataPoint).not.toHaveBeenCalled();
    expectSecurityHeaders(response);
  });

  it("serves a link unfurl without inflating the download count", async () => {
    const { env, writeDataPoint } = environment();

    const response = await handleRequest(
      new Request("https://win.cmtrace.localhost:8659/", { method: "HEAD" }),
      env,
      shortlinkGithubFetcher(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(downloadUrl("CMTrace-Open_1.5.0_x64.exe"));
    expect(await response.text()).toBe("");
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("pins the source label at the hostname and never reads request metadata", async () => {
    const { env, writeDataPoint } = environment();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handleRequest(
      new Request("https://win.cmtrace.localhost:8659/?source=person-private&target=https://evil.example/", {
        headers: {
          "CF-Connecting-IP": "203.0.113.9",
          Cookie: "visitor=private",
          Referer: "https://private.example/person/42",
          "User-Agent": "private-browser-agent",
        },
      }),
      env,
      shortlinkGithubFetcher(),
    );

    expect(response.status).toBe(302);
    expect(writeDataPoint).toHaveBeenCalledOnce();
    const event = writeDataPoint.mock.calls[0][0];
    expect(event.blobs.at(-1)).toBe("cmtrace-net");
    expect(JSON.stringify(event)).not.toMatch(/203\.0\.113\.9|private-browser-agent|private\.example|evil\.example|person-private/);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    "cmtrace.net",
    "www.cmtrace.net",
    "win.cmtrace.net",
    "winarm.cmtrace.net",
    "lite.cmtrace.net",
    "mac.cmtrace.net",
    "msi.cmtrace.net",
    "nightly.cmtrace.net",
  ])("routes %s to the shortlink surface", (host) => {
    expect(surfaceFor(host)).toBe("shortlink");
  });

  it("refuses an unmapped subdomain of the shortlink zone", async () => {
    const { env, writeDataPoint } = environment();
    const fetcher = vi.fn();

    expect(surfaceFor("foo.cmtrace.net")).toBe("unknown");

    const response = await handleRequest(
      new Request("https://foo.cmtrace.localhost:8659/"),
      env,
      fetcher as unknown as typeof fetch,
    );

    expect(response.status).toBe(421);
    expect(fetcher).not.toHaveBeenCalled();
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});
