import { classifyAsset } from "./classify";
import type { Channel, ClassifiedReleaseAsset, NormalizedRelease } from "./types";

const API = "https://api.github.com/repos/adamgell/cmtraceopen";
const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "cmtraceopen-download-worker",
};

const STABLE_CACHE_SECONDS = 300;
const NIGHTLY_CACHE_SECONDS = 120;
const ASSET_CACHE_SECONDS = 3600;
const STABLE_CACHE_PATH = "/.cmtraceopen-cache/github/stable-release";
const NIGHTLY_CACHE_PATH = "/.cmtraceopen-cache/github/nightly-release";
const ASSET_CACHE_PATH = "/.cmtraceopen-cache/github/assets";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`GitHub response has an invalid ${field}.`);
  }
  return value;
}

function decodePathSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes("/") ? null : decoded;
  } catch {
    return null;
  }
}

function downloadPathParts(url: string): { tag: string; filename: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return null;
  }

  const parts = parsed.pathname.split("/");
  if (
    parts.length !== 7 ||
    parts[0] !== "" ||
    parts[1] !== "adamgell" ||
    parts[2] !== "cmtraceopen" ||
    parts[3] !== "releases" ||
    parts[4] !== "download"
  ) {
    return null;
  }

  const tag = decodePathSegment(parts[5]);
  const filename = decodePathSegment(parts[6]);
  return tag && filename ? { tag, filename } : null;
}

export function isAllowedDownloadUrl(url: string): boolean {
  return downloadPathParts(url) !== null;
}

function isAllowedReleasePage(url: string, tag: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return false;
  }

  const parts = parsed.pathname.split("/");
  return (
    parts.length === 7 &&
    parts[0] === "" &&
    parts[1] === "adamgell" &&
    parts[2] === "cmtraceopen" &&
    parts[3] === "releases" &&
    parts[4] === "tag" &&
    decodePathSegment(parts[5]) === tag &&
    parts[6] === ""
  ) || (
    parts.length === 6 &&
    parts[0] === "" &&
    parts[1] === "adamgell" &&
    parts[2] === "cmtraceopen" &&
    parts[3] === "releases" &&
    parts[4] === "tag" &&
    decodePathSegment(parts[5]) === tag
  );
}

function normalizeAsset(
  value: unknown,
  releaseTag: string,
  publishedAt: string,
  channel: Channel,
): ClassifiedReleaseAsset {
  if (!isObject(value)) {
    throw new Error("GitHub response contains an invalid asset.");
  }

  if (!isPositiveSafeInteger(value.id)) {
    throw new Error("GitHub response contains a nonnumeric asset ID.");
  }

  const name = requireString(value.name, "asset name");
  const browserDownloadUrl = requireString(
    value.browser_download_url,
    "asset download URL",
  );
  const contentType = requireString(value.content_type, "asset content type");
  if (
    typeof value.size !== "number" ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0
  ) {
    throw new Error("GitHub response contains an invalid asset size.");
  }

  const path = downloadPathParts(browserDownloadUrl);
  if (!path) {
    throw new Error("GitHub response contains a disallowed asset target.");
  }
  if (path.tag !== releaseTag || path.filename !== name) {
    throw new Error("GitHub response contains mismatched asset metadata.");
  }

  const classification = classifyAsset(name);
  if (
    classification.packageType === "unknown" ||
    classification.deliveryRole === "unknown"
  ) {
    throw new Error(`No trusted classification exists for asset ${name}.`);
  }

  return {
    ...classification,
    id: value.id,
    name,
    size: value.size,
    contentType,
    browserDownloadUrl,
    releaseTag,
    channel,
    publishedAt,
  };
}

function normalizeStableRelease(value: unknown): NormalizedRelease {
  if (!isObject(value)) {
    throw new Error("GitHub returned an invalid stable release response.");
  }
  if (value.draft !== false || value.prerelease !== false) {
    throw new Error("GitHub latest response is not a published stable release.");
  }

  const tag = requireString(value.tag_name, "release tag");
  const name = requireString(value.name, "release name");
  const publishedAt = requireString(value.published_at, "release publication time");
  const htmlUrl = requireString(value.html_url, "release page URL");
  if (!isAllowedReleasePage(htmlUrl, tag)) {
    throw new Error("GitHub response contains a disallowed release page URL.");
  }
  if (!Array.isArray(value.assets)) {
    throw new Error("GitHub response has an invalid release asset list.");
  }

  return {
    tag,
    name,
    publishedAt,
    htmlUrl,
    assets: value.assets.map((asset) => normalizeAsset(asset, tag, publishedAt, "stable")),
  };
}

function newestAssetTime(assets: unknown[], fallback: string): string {
  const times = assets.flatMap((asset) => {
    if (!isObject(asset)) return [];
    const value = typeof asset.updated_at === "string"
      ? asset.updated_at
      : typeof asset.created_at === "string"
        ? asset.created_at
        : null;
    if (!value) return [];
    const time = Date.parse(value);
    return Number.isNaN(time) ? [] : [{ time, value }];
  });
  return times.length > 0
    ? times.reduce((newest, candidate) => candidate.time > newest.time ? candidate : newest).value
    : fallback;
}

function normalizeNightlyRelease(value: unknown): NormalizedRelease {
  if (!isObject(value)) {
    throw new Error("GitHub returned an invalid nightly release response.");
  }
  if (value.draft !== false || value.prerelease !== true || value.tag_name !== "nightly") {
    throw new Error("GitHub nightly response is not the published nightly prerelease.");
  }

  const tag = requireString(value.tag_name, "nightly release tag");
  const name = requireString(value.name, "nightly release name");
  const releasePublishedAt = requireString(value.published_at, "nightly release publication time");
  const htmlUrl = requireString(value.html_url, "nightly release page URL");
  if (!isAllowedReleasePage(htmlUrl, tag)) {
    throw new Error("GitHub nightly response contains a disallowed release page URL.");
  }
  if (!Array.isArray(value.assets)) {
    throw new Error("GitHub nightly response has an invalid release asset list.");
  }

  const publishedAt = newestAssetTime(value.assets, releasePublishedAt);
  return {
    tag,
    name,
    publishedAt,
    htmlUrl,
    assets: value.assets.map((asset) => normalizeAsset(asset, tag, publishedAt, "nightly")),
  };
}

function cacheKey(request: Request, path: string): Request {
  const origin = new URL(request.url).origin;
  return new Request(new URL(path, origin), { method: "GET" });
}

async function readCachedJson<T>(key: Request): Promise<T | null> {
  const cache = await caches.open("cmtraceopen-downloads");
  const response = await cache.match(key);
  return response ? response.json<T>() : null;
}

async function cacheJson(key: Request, value: unknown, seconds: number): Promise<void> {
  const cache = await caches.open("cmtraceopen-downloads");
  await cache.put(
    key,
    Response.json(value, {
      headers: { "Cache-Control": `public, max-age=${seconds}` },
    }),
  );
}

async function fetchGithubJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}.`);
  }
  return response.json();
}

export async function getStableRelease(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<NormalizedRelease> {
  const key = cacheKey(request, STABLE_CACHE_PATH);
  const cached = await readCachedJson<NormalizedRelease>(key);
  if (cached) {
    return cached;
  }

  const release = normalizeStableRelease(
    await fetchGithubJson(`${API}/releases/latest`, fetcher),
  );
  await cacheJson(key, release, STABLE_CACHE_SECONDS);
  return release;
}

export async function getNightlyRelease(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<NormalizedRelease> {
  const key = cacheKey(request, NIGHTLY_CACHE_PATH);
  const cached = await readCachedJson<NormalizedRelease>(key);
  if (cached) {
    return cached;
  }

  const release = normalizeNightlyRelease(
    await fetchGithubJson(`${API}/releases/tags/nightly`, fetcher),
  );
  await cacheJson(key, release, NIGHTLY_CACHE_SECONDS);
  return release;
}

function assetMetadataMatches(
  verified: ClassifiedReleaseAsset,
  stable: ClassifiedReleaseAsset,
): boolean {
  return (
    verified.id === stable.id &&
    verified.name === stable.name &&
    verified.size === stable.size &&
    verified.contentType === stable.contentType &&
    verified.browserDownloadUrl === stable.browserDownloadUrl &&
    verified.releaseTag === stable.releaseTag
  );
}

export async function getVerifiedAsset(
  id: number,
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<ClassifiedReleaseAsset> {
  return getVerifiedReleaseAsset(id, request, "stable", fetcher);
}

export async function getVerifiedNightlyAsset(
  id: number,
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<ClassifiedReleaseAsset> {
  return getVerifiedReleaseAsset(id, request, "nightly", fetcher);
}

async function getVerifiedReleaseAsset(
  id: number,
  request: Request,
  channel: Channel,
  fetcher: typeof fetch,
): Promise<ClassifiedReleaseAsset> {
  if (!isPositiveSafeInteger(id)) {
    throw new Error("A positive numeric asset ID is required.");
  }

  const key = cacheKey(request, `${ASSET_CACHE_PATH}/${channel}/${id}`);
  const cached = await readCachedJson<ClassifiedReleaseAsset>(key);
  if (cached) {
    return cached;
  }

  const rawAsset = await fetchGithubJson(`${API}/releases/assets/${id}`, fetcher);
  if (!isObject(rawAsset)) {
    throw new Error("GitHub returned an invalid asset response.");
  }
  if (rawAsset.draft === true || (channel === "stable" && rawAsset.prerelease === true)) {
    throw new Error("GitHub asset metadata is marked draft or prerelease.");
  }
  if (rawAsset.id !== id) {
    throw new Error("GitHub returned an asset with a mismatched numeric ID.");
  }

  const release = channel === "stable"
    ? await getStableRelease(request, fetcher)
    : await getNightlyRelease(request, fetcher);
  const releaseAsset = release.assets.find((asset) => asset.id === id);
  if (!releaseAsset) {
    throw new Error(channel === "stable"
      ? "The asset is not part of the latest stable release."
      : "The asset is not part of the current nightly release.");
  }

  const verified = normalizeAsset(
    rawAsset,
    release.tag,
    release.publishedAt,
    channel,
  );
  if (!assetMetadataMatches(verified, releaseAsset)) {
    throw new Error(channel === "stable"
      ? "GitHub asset metadata does not match the latest stable release."
      : "GitHub asset metadata does not match the current nightly release.");
  }

  await cacheJson(key, releaseAsset, ASSET_CACHE_SECONDS);
  return releaseAsset;
}
