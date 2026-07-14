import { describe, expect, it, vi } from "vitest";

import { recommendationRank } from "../src/lib/releases/classify";
import {
  getNightlyRelease,
  getStableRelease,
  getVerifiedAsset,
  getVerifiedNightlyAsset,
  isAllowedDownloadUrl,
} from "../src/lib/releases/github";
import fixture from "./fixtures/release-assets.json";

const API = "https://api.github.com/repos/adamgell/cmtraceopen";
const STABLE_ASSETS = fixture.assets.filter((asset) =>
  asset.browser_download_url.includes("/releases/download/v1.4.0/"),
);
const NIGHTLY_ASSETS = fixture.assets.filter((asset) =>
  asset.browser_download_url.includes("/releases/download/nightly/"),
);
const RECOMMENDED = STABLE_ASSETS.find((asset) => asset.expected_rank === 0);
const NIGHTLY_RECOMMENDED = NIGHTLY_ASSETS.find((asset) => asset.expected_rank === 0);

if (!RECOMMENDED || !NIGHTLY_RECOMMENDED) {
  throw new Error("The release fixture must contain recommended stable and nightly Windows assets.");
}
const RECOMMENDED_ASSET = RECOMMENDED;

type JsonObject = Record<string, unknown>;

function requestFor(testName: string): Request {
  return new Request(`https://${testName}.example.test/download/`, {
    headers: {
      "CF-Connecting-IP": "192.0.2.10",
      Cookie: "visitor=must-not-be-forwarded",
      Referer: "https://private.example/path",
      "User-Agent": "private-browser-agent",
    },
  });
}

function responseJson(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function rawAsset(
  asset = RECOMMENDED_ASSET,
  overrides: JsonObject = {},
): JsonObject {
  return {
    id: asset.id,
    name: asset.name,
    size: asset.size,
    content_type: asset.content_type,
    browser_download_url: asset.browser_download_url,
    ...overrides,
  };
}

function rawStableRelease(overrides: JsonObject = {}): JsonObject {
  return {
    tag_name: "v1.4.0",
    name: "CMTrace Open v1.4.0",
    published_at: "2026-07-01T12:00:00Z",
    html_url: "https://github.com/adamgell/cmtraceopen/releases/tag/v1.4.0",
    draft: false,
    prerelease: false,
    assets: STABLE_ASSETS.map((asset) => rawAsset(asset)),
    ...overrides,
  };
}

function rawNightlyRelease(overrides: JsonObject = {}): JsonObject {
  return {
    tag_name: "nightly",
    name: "CMTrace Open Nightly",
    published_at: "2026-07-01T12:00:00Z",
    html_url: "https://github.com/adamgell/cmtraceopen/releases/tag/nightly",
    draft: false,
    prerelease: true,
    assets: NIGHTLY_ASSETS.map((asset) => rawAsset(asset, {
      created_at: "2026-07-13T21:20:00Z",
      updated_at: "2026-07-13T21:30:00Z",
    })),
    ...overrides,
  };
}

function asFetcher(
  implementation: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return implementation(url, init);
  }) as unknown as typeof fetch;
}

describe("GitHub download URL allowlist", () => {
  it.each([
    "https://github.com/adamgell/cmtraceopen/releases/download/v1.4.0/file.exe",
    "https://github.com/adamgell/cmtraceopen/releases/download/nightly/file.exe",
  ])("accepts only a repository release-download asset URL: %s", (url) => {
    expect(isAllowedDownloadUrl(url)).toBe(true);
  });

  it.each([
    "http://github.com/adamgell/cmtraceopen/releases/download/v1.4.0/file.exe",
    "https://evil.example/adamgell/cmtraceopen/releases/download/v1.4.0/file.exe",
    "https://github.com/other/repo/releases/download/v1/file.exe",
    "https://github.com/adamgell/cmtraceopen/releases/tag/v1.4.0",
    "https://github.com/adamgell/cmtraceopen/releases/download/v1.4.0/nested/file.exe",
    "https://github.com/adamgell/cmtraceopen/releases/download/v1.4.0/file.exe?token=secret",
    "https://github.com:444/adamgell/cmtraceopen/releases/download/v1.4.0/file.exe",
    "https://user@github.com/adamgell/cmtraceopen/releases/download/v1.4.0/file.exe",
    "not a URL",
  ])("rejects a target outside the exact repository asset allowlist: %s", (url) => {
    expect(isAllowedDownloadUrl(url)).toBe(false);
  });
});

describe("getStableRelease", () => {
  it("normalizes the latest stable release and classifies its assets server-side", async () => {
    const fetcher = asFetcher(async (url, init) => {
      expect(url).toBe(`${API}/releases/latest`);
      expect(init).toEqual({
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "cmtraceopen-download-worker",
        },
      });
      return responseJson(rawStableRelease());
    });

    const release = await getStableRelease(requestFor("normalize-stable"), fetcher);

    expect(release).toMatchObject({
      tag: "v1.4.0",
      name: "CMTrace Open v1.4.0",
      publishedAt: "2026-07-01T12:00:00Z",
      htmlUrl: "https://github.com/adamgell/cmtraceopen/releases/tag/v1.4.0",
    });
    expect(release.assets).toHaveLength(STABLE_ASSETS.length);
    expect(release.assets[0]).toEqual({
      ...STABLE_ASSETS[0].expected,
      id: STABLE_ASSETS[0].id,
      name: STABLE_ASSETS[0].name,
      size: STABLE_ASSETS[0].size,
      contentType: STABLE_ASSETS[0].content_type,
      browserDownloadUrl: STABLE_ASSETS[0].browser_download_url,
      releaseTag: "v1.4.0",
      channel: "stable",
      publishedAt: "2026-07-01T12:00:00Z",
    });
    expect(release.assets.filter((asset) => recommendationRank(asset) === 0)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    ["draft", { draft: true }],
    ["prerelease", { prerelease: true }],
  ])("rejects a %s response instead of exposing its assets", async (_label, overrides) => {
    const fetcher = asFetcher(async () => responseJson(rawStableRelease(overrides)));

    await expect(
      getStableRelease(requestFor(`reject-${String(_label)}`), fetcher),
    ).rejects.toThrow(/stable release/i);
  });

  it("rejects a release containing an unknown asset classification", async () => {
    const unknown = rawAsset(RECOMMENDED, {
      id: 900000001,
      name: "mystery-download.bin",
      browser_download_url:
        "https://github.com/adamgell/cmtraceopen/releases/download/v1.4.0/mystery-download.bin",
    });
    const fetcher = asFetcher(async () =>
      responseJson(rawStableRelease({ assets: [unknown] })),
    );

    await expect(
      getStableRelease(requestFor("reject-unknown-classification"), fetcher),
    ).rejects.toThrow(/classification/i);
  });

  it.each([
    ["nonnumeric", { id: "475710704" }],
    ["fractional", { id: 475710704.5 }],
    ["zero", { id: 0 }],
    ["filename mismatch", { name: "different.exe" }],
    [
      "tag mismatch",
      {
        browser_download_url:
          "https://github.com/adamgell/cmtraceopen/releases/download/v9.9.9/CMTrace-Open_1.4.0_x64.exe",
      },
    ],
    [
      "foreign target",
      {
        browser_download_url:
          "https://evil.example/adamgell/cmtraceopen/releases/download/v1.4.0/CMTrace-Open_1.4.0_x64.exe",
      },
    ],
  ])("rejects an asset with %s", async (label, assetOverrides) => {
    const fetcher = asFetcher(async () =>
      responseJson(rawStableRelease({ assets: [rawAsset(RECOMMENDED, assetOverrides)] })),
    );

    await expect(
      getStableRelease(requestFor(`stable-${String(label).replaceAll(" ", "-")}`), fetcher),
    ).rejects.toThrow();
  });

  it("caches only a successful normalized response for 300 seconds", async () => {
    const fetcher = asFetcher(async () => responseJson(rawStableRelease()));
    const request = requestFor("cache-stable-success");

    const first = await getStableRelease(request, fetcher);
    const second = await getStableRelease(request, fetcher);

    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not cache GitHub API failures", async () => {
    let calls = 0;
    const fetcher = asFetcher(async () => {
      calls += 1;
      return calls === 1
        ? responseJson({ message: "upstream unavailable" }, 503)
        : responseJson(rawStableRelease());
    });
    const request = requestFor("no-cache-api-error");

    await expect(getStableRelease(request, fetcher)).rejects.toThrow(/503/);
    await expect(getStableRelease(request, fetcher)).resolves.toMatchObject({ tag: "v1.4.0" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("getNightlyRelease", () => {
  it("normalizes the mutable nightly release and uses its newest asset time", async () => {
    const fetcher = asFetcher(async (url) => {
      expect(url).toBe(`${API}/releases/tags/nightly`);
      return responseJson(rawNightlyRelease());
    });

    const release = await getNightlyRelease(requestFor("normalize-nightly"), fetcher);

    expect(release).toMatchObject({
      tag: "nightly",
      name: "CMTrace Open Nightly",
      publishedAt: "2026-07-13T21:30:00Z",
      htmlUrl: "https://github.com/adamgell/cmtraceopen/releases/tag/nightly",
    });
    expect(release.assets).toHaveLength(NIGHTLY_ASSETS.length);
    expect(release.assets[0]).toMatchObject({ channel: "nightly", releaseTag: "nightly" });
  });

  it.each([
    ["draft", { draft: true }],
    ["not prerelease", { prerelease: false }],
    ["wrong tag", { tag_name: "v1.4.0" }],
  ])("rejects a nightly response marked %s", async (_label, overrides) => {
    const fetcher = asFetcher(async () => responseJson(rawNightlyRelease(overrides)));
    await expect(getNightlyRelease(requestFor(`reject-nightly-${String(_label).replaceAll(" ", "-")}`), fetcher)).rejects.toThrow(/nightly/i);
  });

  it("serves repeated nightly checks from the Worker cache", async () => {
    const fetcher = asFetcher(async () => responseJson(rawNightlyRelease()));
    const request = requestFor("cache-nightly-success");

    const first = await getNightlyRelease(request, fetcher);
    const second = await getNightlyRelease(request, fetcher);

    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("getVerifiedAsset", () => {
  it("resolves a numeric ID through the repository asset endpoint and returns its stable classification", async () => {
    const fetcher = asFetcher(async (url, init) => {
      expect(init).toEqual({
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "cmtraceopen-download-worker",
        },
      });

      if (url === `${API}/releases/assets/${RECOMMENDED.id}`) {
        return responseJson(rawAsset());
      }
      if (url === `${API}/releases/latest`) {
        return responseJson(rawStableRelease());
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const asset = await getVerifiedAsset(
      RECOMMENDED.id,
      requestFor("verified-asset"),
      fetcher,
    );

    expect(asset).toEqual({
      ...RECOMMENDED.expected,
      id: RECOMMENDED.id,
      name: RECOMMENDED.name,
      size: RECOMMENDED.size,
      contentType: RECOMMENDED.content_type,
      browserDownloadUrl: RECOMMENDED.browser_download_url,
      releaseTag: "v1.4.0",
      channel: "stable",
      publishedAt: "2026-07-01T12:00:00Z",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects a non-positive safe integer ID before any API request: %s",
    async (id) => {
      const fetcher = asFetcher(async () => responseJson(rawAsset()));

      await expect(
        getVerifiedAsset(id, requestFor(`invalid-id-${String(id)}`), fetcher),
      ).rejects.toThrow(/numeric asset ID/i);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["different numeric ID", { id: RECOMMENDED.id + 1 }],
    ["different filename", { name: `renamed-${RECOMMENDED.name}` }],
    [
      "different download target",
      {
        browser_download_url:
          "https://github.com/adamgell/cmtraceopen/releases/download/v1.4.0/different.exe",
      },
    ],
    ["draft marker", { draft: true }],
    ["prerelease marker", { prerelease: true }],
  ])("rejects asset API metadata with a %s", async (label, overrides) => {
    const fetcher = asFetcher(async (url) =>
      url.endsWith(`/releases/assets/${RECOMMENDED.id}`)
        ? responseJson(rawAsset(RECOMMENDED, overrides))
        : responseJson(rawStableRelease()),
    );

    await expect(
      getVerifiedAsset(
        RECOMMENDED.id,
        requestFor(`asset-${String(label).replaceAll(" ", "-")}`),
        fetcher,
      ),
    ).rejects.toThrow();
  });

  it("rejects an asset that is not a member of the latest stable release", async () => {
    const fetcher = asFetcher(async (url) =>
      url.endsWith(`/releases/assets/${RECOMMENDED.id}`)
        ? responseJson(rawAsset())
        : responseJson(rawStableRelease({ assets: [] })),
    );

    await expect(
      getVerifiedAsset(
        RECOMMENDED.id,
        requestFor("asset-not-in-stable-release"),
        fetcher,
      ),
    ).rejects.toThrow(/latest stable release/i);
  });

  it("caches only verified asset metadata for 3600 seconds", async () => {
    const fetcher = asFetcher(async (url) =>
      url.endsWith(`/releases/assets/${RECOMMENDED.id}`)
        ? responseJson(rawAsset())
        : responseJson(rawStableRelease()),
    );
    const request = requestFor("cache-verified-asset");

    const first = await getVerifiedAsset(RECOMMENDED.id, request, fetcher);
    const callsAfterFirstVerification = vi.mocked(fetcher).mock.calls.length;
    const second = await getVerifiedAsset(RECOMMENDED.id, request, fetcher);

    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(callsAfterFirstVerification);
  });

  it("does not cache an asset API failure", async () => {
    let assetCalls = 0;
    const fetcher = asFetcher(async (url) => {
      if (url.endsWith(`/releases/assets/${RECOMMENDED.id}`)) {
        assetCalls += 1;
        return assetCalls === 1
          ? responseJson({ message: "not found" }, 404)
          : responseJson(rawAsset());
      }
      return responseJson(rawStableRelease());
    });
    const request = requestFor("no-cache-asset-api-error");

    await expect(getVerifiedAsset(RECOMMENDED.id, request, fetcher)).rejects.toThrow(/404/);
    await expect(getVerifiedAsset(RECOMMENDED.id, request, fetcher)).resolves.toMatchObject({
      id: RECOMMENDED.id,
    });
    expect(assetCalls).toBe(2);
  });
});

describe("getVerifiedNightlyAsset", () => {
  it("verifies an asset belongs to the current mutable nightly release", async () => {
    const fetcher = asFetcher(async (url) => {
      if (url === `${API}/releases/assets/${NIGHTLY_RECOMMENDED.id}`) {
        return responseJson(rawAsset(NIGHTLY_RECOMMENDED));
      }
      if (url === `${API}/releases/tags/nightly`) {
        return responseJson(rawNightlyRelease());
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const asset = await getVerifiedNightlyAsset(
      NIGHTLY_RECOMMENDED.id,
      requestFor("verified-nightly-asset"),
      fetcher,
    );

    expect(asset).toMatchObject({
      id: NIGHTLY_RECOMMENDED.id,
      channel: "nightly",
      releaseTag: "nightly",
      packageType: "portable-exe",
    });
  });
});
