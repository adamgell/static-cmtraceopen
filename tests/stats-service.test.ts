import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readSelectionStats } from "../src/lib/stats/analytics";
import { readGithubStats } from "../src/lib/stats/github";
import {
  getPublicStats,
  type StatsConfig,
  type StatsDependencies,
} from "../src/lib/stats/service";
import type { PublicStats } from "../src/lib/stats/types";

vi.mock("../src/lib/stats/analytics", () => ({
  readSelectionStats: vi.fn(),
}));

vi.mock("../src/lib/stats/github", () => ({
  readGithubStats: vi.fn(),
}));

const NOW = new Date("2026-07-16T12:00:00.000Z");
const REQUEST = new Request("https://cmtraceopen.com/api/stats");
const CONFIG: StatsConfig = {
  cloudflareAccountId: "account-id",
  analyticsReadToken: "analytics-token-that-must-stay-private",
};
const DEPENDENCIES: StatsDependencies = {
  githubFetcher: vi.fn() as unknown as typeof fetch,
  analyticsFetcher: vi.fn() as unknown as typeof fetch,
  now: () => NOW,
};

const GITHUB = {
  stars: 42,
  packageDownloads: {
    total: 120,
    stable: 100,
    currentNightly: 20,
    byPlatform: { windows: 80, macos: 25, linux: 15 },
  },
};

const SELECTIONS = {
  windowDays: 30 as const,
  total: 18,
  byChannel: { stable: 12, nightly: 6 },
  byPlatform: { windows: 10, macos: 5, linux: 3 },
  bySource: { "download-home": 12, "github-release": 6 },
};

function snapshot(overrides: Partial<PublicStats> = {}): PublicStats {
  return {
    generatedAt: "2026-07-16T10:00:00.000Z",
    github: {
      status: "fresh",
      updatedAt: "2026-07-16T10:00:00.000Z",
      ...GITHUB,
    },
    selections: {
      status: "fresh",
      updatedAt: "2026-07-16T10:00:00.000Z",
      ...SELECTIONS,
    },
    ...overrides,
  };
}

function cacheWith(initial?: PublicStats) {
  let stored = initial
    ? new Response(JSON.stringify(initial), {
      headers: { "Content-Type": "application/json" },
    })
    : undefined;
  const cache = {
    match: vi.fn(async () => stored?.clone()),
    put: vi.fn(async (_request: RequestInfo | URL, response: Response) => {
      stored = response.clone();
    }),
  };
  vi.spyOn(caches, "open").mockResolvedValue(cache as unknown as Cache);
  return { cache, stored: () => stored?.clone() };
}

beforeEach(() => {
  vi.mocked(readGithubStats).mockResolvedValue(GITHUB);
  vi.mocked(readSelectionStats).mockResolvedValue(SELECTIONS);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getPublicStats", () => {
  it("returns and caches a complete fresh snapshot", async () => {
    const { cache, stored } = cacheWith();

    const result = await getPublicStats(REQUEST, CONFIG, DEPENDENCIES);

    expect(result).toEqual({
      status: 200,
      stats: snapshot({
        generatedAt: NOW.toISOString(),
        github: {
          status: "fresh",
          updatedAt: NOW.toISOString(),
          ...GITHUB,
        },
        selections: {
          status: "fresh",
          updatedAt: NOW.toISOString(),
          ...SELECTIONS,
        },
      }),
    });
    expect(readGithubStats).toHaveBeenCalledWith(DEPENDENCIES.githubFetcher);
    expect(readSelectionStats).toHaveBeenCalledWith(
      CONFIG.cloudflareAccountId,
      CONFIG.analyticsReadToken,
      DEPENDENCIES.analyticsFetcher,
    );
    expect(cache.put).toHaveBeenCalledOnce();
    expect(stored()?.headers.get("Cache-Control")).toBe("public, max-age=86400");
    await expect(stored()?.json()).resolves.toEqual(result.stats);
  });

  it("returns a cached snapshot younger than one hour without provider calls", async () => {
    const fresh = snapshot({ generatedAt: "2026-07-16T11:30:00.000Z" });
    const { cache } = cacheWith(fresh);

    const result = await getPublicStats(REQUEST, CONFIG, DEPENDENCIES);

    expect(result).toEqual({ status: 200, stats: fresh });
    expect(readGithubStats).not.toHaveBeenCalled();
    expect(readSelectionStats).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("returns fresh selections and unavailable GitHub data when GitHub fails without old data", async () => {
    cacheWith();
    vi.mocked(readGithubStats).mockRejectedValue(
      new Error("github-provider-secret"),
    );

    const result = await getPublicStats(REQUEST, CONFIG, DEPENDENCIES);

    expect(result.status).toBe(200);
    expect(result.stats.github).toEqual({
      status: "unavailable",
      updatedAt: null,
      stars: null,
      packageDownloads: null,
    });
    expect(result.stats.selections).toEqual({
      status: "fresh",
      updatedAt: NOW.toISOString(),
      ...SELECTIONS,
    });
  });

  it("preserves a failed provider value younger than 24 hours as stale", async () => {
    const originalUpdatedAt = "2026-07-15T13:00:00.000Z";
    const old = snapshot({
      generatedAt: "2026-07-16T10:00:00.000Z",
      github: {
        status: "fresh",
        updatedAt: originalUpdatedAt,
        ...GITHUB,
      },
    });
    cacheWith(old);
    vi.mocked(readGithubStats).mockRejectedValue(new Error("GitHub failed"));

    const result = await getPublicStats(REQUEST, CONFIG, DEPENDENCIES);

    expect(result.status).toBe(200);
    expect(result.stats.github).toEqual({
      status: "stale",
      updatedAt: originalUpdatedAt,
      ...GITHUB,
    });
    expect(result.stats.generatedAt).toBe(NOW.toISOString());
  });

  it("returns 503 with both providers unavailable when failures have no usable cache", async () => {
    cacheWith(snapshot({
      generatedAt: "2026-07-14T10:00:00.000Z",
      github: {
        status: "fresh",
        updatedAt: "2026-07-14T10:00:00.000Z",
        ...GITHUB,
      },
      selections: {
        status: "fresh",
        updatedAt: "2026-07-14T10:00:00.000Z",
        ...SELECTIONS,
      },
    }));
    vi.mocked(readGithubStats).mockRejectedValue(new Error("GitHub failed"));
    vi.mocked(readSelectionStats).mockRejectedValue(new Error("Analytics failed"));

    const result = await getPublicStats(REQUEST, CONFIG, DEPENDENCIES);

    expect(result.status).toBe(503);
    expect(result.stats.github.status).toBe("unavailable");
    expect(result.stats.selections.status).toBe("unavailable");
  });

  it("never serializes provider errors or configured credentials", async () => {
    cacheWith();
    const providerSecret = "provider-response-secret";
    vi.mocked(readGithubStats).mockRejectedValue(new Error(providerSecret));
    vi.mocked(readSelectionStats).mockRejectedValue(new Error(providerSecret));

    const result = await getPublicStats(REQUEST, CONFIG, DEPENDENCIES);
    const serialized = JSON.stringify(result.stats);

    expect(serialized).not.toContain(providerSecret);
    expect(serialized).not.toContain(CONFIG.analyticsReadToken);
    expect(serialized).not.toContain(CONFIG.cloudflareAccountId);
  });
});
