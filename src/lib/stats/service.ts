import { readSelectionStats } from "./analytics";
import { readGithubStats } from "./github";
import type { PublicStats } from "./types";
import { SOURCE_LABELS } from "../releases/classify";
import type { SourceLabel } from "../releases/types";

const FRESH_MS = 60 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const CACHE_NAME = "cmtraceopen-public-stats";
const CACHE_URL = "https://stats-cache.invalid/public-stats";

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
type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function hasCounts(value: unknown, keys: readonly string[]): boolean {
  return isJsonObject(value) && keys.every((key) => isCount(value[key]));
}

function isStatus(value: unknown): boolean {
  return value === "fresh" || value === "stale" || value === "unavailable";
}

function isTimestamp(value: unknown, nullable: boolean): boolean {
  return (nullable && value === null) ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function isPackageDownloads(value: unknown): boolean {
  return value === null ||
    (isJsonObject(value) &&
      isCount(value.total) &&
      isCount(value.stable) &&
      isCount(value.currentNightly) &&
      hasCounts(value.byPlatform, ["windows", "macos", "linux"]));
}

function isSourceCounts(value: unknown): boolean {
  return isJsonObject(value) && Object.entries(value).every(
    ([source, count]) =>
      SOURCE_LABELS.has(source as SourceLabel) && isCount(count),
  );
}

function isPublicStats(value: unknown): value is PublicStats {
  if (
    !isJsonObject(value) ||
    !isTimestamp(value.generatedAt, false) ||
    !isJsonObject(value.github) ||
    !isJsonObject(value.selections)
  ) {
    return false;
  }

  const github = value.github;
  const selections = value.selections;
  return isStatus(github.status) &&
    isTimestamp(github.updatedAt, true) &&
    (github.stars === null || isCount(github.stars)) &&
    isPackageDownloads(github.packageDownloads) &&
    isStatus(selections.status) &&
    isTimestamp(selections.updatedAt, true) &&
    selections.windowDays === 30 &&
    (selections.total === null || isCount(selections.total)) &&
    (selections.byChannel === null ||
      hasCounts(selections.byChannel, ["stable", "nightly"])) &&
    (selections.byPlatform === null ||
      hasCounts(selections.byPlatform, ["windows", "macos", "linux"])) &&
    (selections.bySource === null || isSourceCounts(selections.bySource));
}

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

function sanitizeCachedStats(cached: PublicStats, now: number): PublicStats {
  const github =
    ageInRange(cached.github.updatedAt, now, STALE_MS) &&
      cached.github.stars !== null &&
      cached.github.packageDownloads !== null
      ? cached.github
      : unavailableGithub();
  const selections =
    ageInRange(cached.selections.updatedAt, now, STALE_MS) &&
      cached.selections.total !== null &&
      cached.selections.byChannel !== null &&
      cached.selections.byPlatform !== null &&
      cached.selections.bySource !== null
      ? cached.selections
      : unavailableSelections();

  return { ...cached, github, selections };
}

async function readCachedStats(
  cache: Cache,
  cacheKey: Request,
): Promise<PublicStats | undefined> {
  try {
    const response = await cache.match(cacheKey);
    if (!response) return undefined;
    const value: unknown = await response.json();
    return isPublicStats(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function openStatsCache(): Promise<Cache | undefined> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return undefined;
  }
}

async function writeCachedStats(
  cache: Cache | undefined,
  cacheKey: Request,
  stats: PublicStats,
): Promise<void> {
  if (!cache) return;
  try {
    await cache.put(
      cacheKey,
      Response.json(stats, {
        headers: { "Cache-Control": "public, max-age=86400" },
      }),
    );
  } catch {
    // Cache availability must not replace successfully refreshed provider data.
  }
}

export async function getPublicStats(
  _request: Request,
  config: StatsConfig,
  dependencies: StatsDependencies = {},
): Promise<{ status: number; stats: PublicStats }> {
  const currentDate = dependencies.now?.() ?? new Date();
  const currentTime = currentDate.getTime();
  const generatedAt = currentDate.toISOString();
  const cache = await openStatsCache();
  const cacheKey = new Request(CACHE_URL, { method: "GET" });
  const cached = cache ? await readCachedStats(cache, cacheKey) : undefined;

  if (cached && ageInRange(cached.generatedAt, currentTime, FRESH_MS)) {
    const sanitized = sanitizeCachedStats(cached, currentTime);
    const status = sanitized.github.status === "unavailable" &&
      sanitized.selections.status === "unavailable"
      ? 503
      : 200;
    return { status, stats: sanitized };
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
    await writeCachedStats(cache, cacheKey, stats);
  }

  return { status: available ? 200 : 503, stats };
}
