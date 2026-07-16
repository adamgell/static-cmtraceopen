import { classifyAsset } from "../releases/classify";
import type {
  GithubStats,
  PackageDownloadCounts,
  PublicChannel,
  PublicPlatform,
} from "./types";

export const GITHUB_REPOSITORY_API =
  "https://api.github.com/repos/adamgell/cmtraceopen";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "cmtraceopen-public-stats",
};

const INSTALLABLE_ROLES = new Set([
  "manual-only",
  "mixed-manual-update",
]);

type JsonObject = Record<string, unknown>;

function invalidProviderData(): Error {
  return new Error("Invalid GitHub provider data");
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function addCount(current: number, increment: number): number {
  const next = current + increment;
  if (!Number.isSafeInteger(next)) {
    throw invalidProviderData();
  }
  return next;
}

async function fetchGithubJson(
  url: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: GITHUB_HEADERS });
  } catch {
    throw new Error("GitHub provider request failed");
  }

  if (!response.ok) {
    throw new Error("GitHub provider request failed");
  }

  try {
    return await response.json();
  } catch {
    throw invalidProviderData();
  }
}

function readStars(value: unknown): number {
  if (
    !isJsonObject(value) ||
    !isNonNegativeSafeInteger(value.stargazers_count)
  ) {
    throw invalidProviderData();
  }
  return value.stargazers_count;
}

function releaseChannel(release: JsonObject): PublicChannel | null {
  if (
    typeof release.tag_name !== "string" ||
    typeof release.draft !== "boolean" ||
    typeof release.prerelease !== "boolean"
  ) {
    throw invalidProviderData();
  }

  if (!release.draft && !release.prerelease) {
    return "stable";
  }

  if (!release.draft && release.prerelease && release.tag_name === "nightly") {
    return "nightly";
  }

  return null;
}

function addReleaseDownloads(
  counts: PackageDownloadCounts,
  release: JsonObject,
): void {
  const channel = releaseChannel(release);
  if (!Array.isArray(release.assets)) {
    throw invalidProviderData();
  }

  for (const asset of release.assets) {
    if (
      !isJsonObject(asset) ||
      typeof asset.name !== "string" ||
      !isNonNegativeSafeInteger(asset.download_count)
    ) {
      throw invalidProviderData();
    }

    if (channel === null) {
      continue;
    }

    const classification = classifyAsset(asset.name);
    if (
      !INSTALLABLE_ROLES.has(classification.deliveryRole) ||
      (classification.platform !== "windows" &&
        classification.platform !== "macos" &&
        classification.platform !== "linux")
    ) {
      continue;
    }

    const platform = classification.platform as PublicPlatform;
    counts.total = addCount(counts.total, asset.download_count);
    counts.byPlatform[platform] = addCount(
      counts.byPlatform[platform],
      asset.download_count,
    );

    if (channel === "stable") {
      counts.stable = addCount(counts.stable, asset.download_count);
    } else {
      counts.currentNightly = addCount(
        counts.currentNightly,
        asset.download_count,
      );
    }
  }
}

function readReleasePage(
  value: unknown,
  counts: PackageDownloadCounts,
): number {
  if (!Array.isArray(value) || value.length > 100) {
    throw invalidProviderData();
  }

  for (const release of value) {
    if (!isJsonObject(release)) {
      throw invalidProviderData();
    }
    addReleaseDownloads(counts, release);
  }

  return value.length;
}

export async function readGithubStats(
  fetcher: typeof fetch = fetch,
): Promise<GithubStats> {
  const stars = readStars(
    await fetchGithubJson(GITHUB_REPOSITORY_API, fetcher),
  );
  const packageDownloads: PackageDownloadCounts = {
    total: 0,
    stable: 0,
    currentNightly: 0,
    byPlatform: { windows: 0, macos: 0, linux: 0 },
  };

  for (let page = 1; ; page += 1) {
    const pageLength = readReleasePage(
      await fetchGithubJson(
        `${GITHUB_REPOSITORY_API}/releases?per_page=100&page=${page}`,
        fetcher,
      ),
      packageDownloads,
    );

    if (pageLength < 100) {
      break;
    }
  }

  return { stars, packageDownloads };
}
