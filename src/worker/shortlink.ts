import { recordDownload } from "../lib/releases/analytics";
import { getNightlyRelease, getStableRelease } from "../lib/releases/github";
import { findAsset, type AssetSpec } from "../lib/releases/select";
import type { Channel } from "../lib/releases/types";
import { redirect, secure } from "./response";

type ShortlinkRoute =
  | { kind: "site"; location: string }
  | { kind: "download"; channel: Channel; spec: AssetSpec; fallback: string };

const SHORTLINK_SOURCE = "cmtrace-net" as const;

const PRODUCT_HOME = "https://cmtraceopen.com/";
const STABLE_FALLBACK = `https://download.cmtraceopen.com/?source=${SHORTLINK_SOURCE}`;
const NIGHTLY_FALLBACK = "https://cmtraceopen.com/nightly/";

const SITE_CACHE_CONTROL = "public, max-age=86400";
const ROBOTS_BODY = "User-agent: *\nDisallow: /\n";

function stable(spec: AssetSpec): ShortlinkRoute {
  return { kind: "download", channel: "stable", spec, fallback: STABLE_FALLBACK };
}

const SITE: ShortlinkRoute = { kind: "site", location: PRODUCT_HOME };

const WINDOWS_X64_FULL = stable({
  platform: "windows",
  architecture: "x64",
  edition: "full",
  packageType: "portable-exe",
});
const WINDOWS_ARM64_FULL = stable({
  platform: "windows",
  architecture: "arm64",
  edition: "full",
  packageType: "portable-exe",
});
const WINDOWS_X64_LITE = stable({
  platform: "windows",
  architecture: "x64",
  edition: "lite",
  packageType: "portable-exe",
});
const MACOS_ARM64_DMG = stable({
  platform: "macos",
  architecture: "arm64",
  edition: "full",
  packageType: "dmg",
});
const WINDOWS_X64_MSI = stable({
  platform: "windows",
  architecture: "x64",
  edition: "full",
  packageType: "msi",
});
const NIGHTLY_WINDOWS_X64_FULL: ShortlinkRoute = {
  kind: "download",
  channel: "nightly",
  spec: {
    platform: "windows",
    architecture: "x64",
    edition: "full",
    packageType: "portable-exe",
  },
  fallback: NIGHTLY_FALLBACK,
};

const SUBDOMAINS: [string, ShortlinkRoute][] = [
  ["win", WINDOWS_X64_FULL],
  ["winarm", WINDOWS_ARM64_FULL],
  ["lite", WINDOWS_X64_LITE],
  ["mac", MACOS_ARM64_DMG],
  ["msi", WINDOWS_X64_MSI],
  ["nightly", NIGHTLY_WINDOWS_X64_FULL],
];

// "cmtrace.localhost" mirrors the production zone shape exactly so that local
// development and the worker tests exercise the same label-stripping in
// releaseCacheRequest() that production does.
const ZONES = ["cmtrace.net", "cmtrace.localhost"];

const ROUTES = new Map<string, ShortlinkRoute>(
  ZONES.flatMap((zone) => [
    [zone, SITE] as [string, ShortlinkRoute],
    [`www.${zone}`, SITE] as [string, ShortlinkRoute],
    ...SUBDOMAINS.map(
      ([label, route]) => [`${label}.${zone}`, route] as [string, ShortlinkRoute],
    ),
  ]),
);

export function shortlinkRoute(hostname: string): ShortlinkRoute | undefined {
  return ROUTES.get(hostname.toLowerCase().split(":", 1)[0]);
}

// The release cache is keyed on the request origin, so without this every
// shortlink hostname would open its own cache slot for the same GitHub payload
// and multiply the cold-miss API calls by the number of hosts. Collapsing them
// onto the zone apex keeps all six sharing one entry. The port is preserved,
// which is what keeps the per-test port isolation in tests/worker.test.ts working.
function releaseCacheRequest(url: URL): Request {
  const canonical = new URL(url.toString());
  const parent = url.hostname.split(".").slice(1).join(".");
  if (parent !== "") canonical.hostname = parent;
  canonical.pathname = "/";
  canonical.search = "";
  canonical.hash = "";
  return new Request(canonical, { method: "GET" });
}

export async function handleShortlink(
  request: Request,
  env: Env,
  url: URL,
  route: ShortlinkRoute,
  fetcher: typeof fetch,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return secure(new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } }));
  }

  // Without this, a crawler following the bare hostname is redirected into a
  // multi-megabyte installer and the shortlink hosts index as duplicate-content
  // competitors to cmtraceopen.com.
  if (url.pathname === "/robots.txt") {
    return secure(
      new Response(ROBOTS_BODY, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": SITE_CACHE_CONTROL,
        },
      }),
    );
  }

  // Stops a browser's automatic favicon probe from pulling an installer.
  if (url.pathname === "/favicon.ico") {
    return secure(new Response(null, { status: 204 }));
  }

  if (route.kind === "site") {
    return redirect(route.location, { status: 301, cacheControl: SITE_CACHE_CONTROL });
  }

  const cacheRequest = releaseCacheRequest(url);

  try {
    const release =
      route.channel === "stable"
        ? await getStableRelease(cacheRequest, fetcher)
        : await getNightlyRelease(cacheRequest, fetcher);

    const asset = findAsset(release, route.spec);
    // A shortlink is pasted into tickets and read off slides, so a release that
    // is missing this artifact degrades to the chooser rather than dead-ending.
    // No event is recorded: nothing was verified, so nothing is counted.
    if (!asset) return redirect(route.fallback, { cacheControl: "no-store" });

    if (request.method === "GET") {
      recordDownload(env.DOWNLOAD_EVENTS, asset, SHORTLINK_SOURCE);
    }
    return redirect(asset.browserDownloadUrl, { cacheControl: "no-store" });
  } catch {
    return redirect(route.fallback, { cacheControl: "no-store" });
  }
}
