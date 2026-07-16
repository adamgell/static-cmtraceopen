import { readSelectionStats } from "./analytics";
import { readGithubStats } from "./github";
import type { PublicStats } from "./types";

const FRESH_MS = 60 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const CACHE_NAME = "cmtraceopen-public-stats";
const CACHE_PATH = "/.cmtraceopen-cache/public-stats";

export type StatsConfig = {
  cloudflareAccountId?: string;
  analyticsReadToken?: string;
};

export type StatsDependencies = {
  githubFetcher?: typeof fetch;
  analyticsFetcher?: typeof fetch;
  now?: () => Date;
};

type GithubProvider = PublicStats["github"];
type SelectionProvider = PublicStats["selections"];

function ageInRange(
  timestamp: string | null,
  now: number,
  maximumAge: number,
): boolean {
  if (timestamp === null) return false;
  const age = now - Date.parse(timestamp);
  return Number.isFinite(age) && age >= 0 && age < maximumAge;
}

function unavailableGithub(): GithubProvider {
  return {
    status: "unavailable",
    updatedAt: null,
    stars: null,
    packageDownloads: null,
  };
}

function unavailableSelections(): SelectionProvider {
  return {
    status: "unavailable",
    updatedAt: null,
    windowDays: 30,
    total: null,
    byChannel: null,
    byPlatform: null,
    bySource: null,
  };
}

function staleGithub(
  cached: PublicStats | undefined,
  now: number,
): GithubProvider {
  if (
    cached &&
    ageInRange(cached.github.updatedAt, now, STALE_MS) &&
    cached.github.stars !== null &&
    cached.github.packageDownloads !== null
  ) {
    return { ...cached.github, status: "stale" };
  }
  return unavailableGithub();
}

function staleSelections(
  cached: PublicStats | undefined,
  now: number,
): SelectionProvider {
  if (
    cached &&
    ageInRange(cached.selections.updatedAt, now, STALE_MS) &&
    cached.selections.total !== null &&
    cached.selections.byChannel !== null &&
    cached.selections.byPlatform !== null &&
    cached.selections.bySource !== null
  ) {
    return { ...cached.selections, status: "stale" };
  }
  return unavailableSelections();
}

async function readCachedStats(
  cache: Cache,
  cacheKey: Request,
): Promise<PublicStats | undefined> {
  try {
    const response = await cache.match(cacheKey);
    if (!response) return undefined;
    return await response.json<PublicStats>();
  } catch {
    return undefined;
  }
}

export async function getPublicStats(
  request: Request,
  config: StatsConfig,
  dependencies: StatsDependencies = {},
): Promise<{ status: number; stats: PublicStats }> {
  const currentDate = dependencies.now?.() ?? new Date();
  const currentTime = currentDate.getTime();
  const generatedAt = currentDate.toISOString();
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new Request(new URL(CACHE_PATH, request.url), {
    method: "GET",
  });
  const cached = await readCachedStats(cache, cacheKey);

  if (cached && ageInRange(cached.generatedAt, currentTime, FRESH_MS)) {
    const status = cached.github.status === "unavailable" &&
      cached.selections.status === "unavailable"
      ? 503
      : 200;
    return { status, stats: cached };
  }

  const githubRequest = Promise.resolve().then(() =>
    readGithubStats(dependencies.githubFetcher ?? fetch)
  );
  const analyticsRequest = Promise.resolve().then(() => {
    const accountId = config.cloudflareAccountId?.trim();
    const token = config.analyticsReadToken?.trim();
    if (!accountId || !token) {
      throw new Error("Analytics provider unavailable");
    }
    return readSelectionStats(
      accountId,
      token,
      dependencies.analyticsFetcher ?? fetch,
    );
  });
  const [githubResult, analyticsResult] = await Promise.allSettled([
    githubRequest,
    analyticsRequest,
  ]);

  const github: GithubProvider = githubResult.status === "fulfilled"
    ? {
      status: "fresh",
      updatedAt: generatedAt,
      stars: githubResult.value.stars,
      packageDownloads: githubResult.value.packageDownloads,
    }
    : staleGithub(cached, currentTime);
  const selections: SelectionProvider = analyticsResult.status === "fulfilled"
    ? {
      status: "fresh",
      updatedAt: generatedAt,
      ...analyticsResult.value,
    }
    : staleSelections(cached, currentTime);
  const stats: PublicStats = { generatedAt, github, selections };
  const available = github.status !== "unavailable" ||
    selections.status !== "unavailable";

  if (available) {
    await cache.put(
      cacheKey,
      Response.json(stats, {
        headers: { "Cache-Control": "public, max-age=86400" },
      }),
    );
  }

  return { status: available ? 200 : 503, stats };
}
