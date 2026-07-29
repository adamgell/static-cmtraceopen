import { describe, expect, it, vi } from "vitest";

import {
  GITHUB_REPOSITORY_API,
  readGithubStats,
} from "../src/lib/stats/github";

type JsonObject = Record<string, unknown>;

const RELEASES_API = `${GITHUB_REPOSITORY_API}/releases`;

function asset(name: string, downloadCount: number): JsonObject {
  return { name, download_count: downloadCount };
}

function release(overrides: JsonObject = {}): JsonObject {
  return {
    tag_name: "v1.4.0",
    draft: false,
    prerelease: false,
    assets: [],
    ...overrides,
  };
}

const STABLE_RELEASE = release({
  assets: [
    asset("CMTrace-Open_1.4.0_x64-setup.exe", 12),
    asset("CMTrace.Open_1.4.0_aarch64.dmg", 8),
    asset("CMTrace.Open_1.4.0_amd64.AppImage", 7),
    asset("latest.json", 1_000),
    asset("CMTrace.Open_1.4.0_aarch64.app.tar.gz", 1_000),
    asset("CMTrace-Open_1.4.0_x64-setup.exe.sig", 1_000),
    asset("sbom-CMTrace-Open-1.4.0.cdx.json", 1_000),
    asset("unknown-package.zip", 1_000),
  ],
});

const CURRENT_NIGHTLY_RELEASE = release({
  tag_name: "nightly",
  prerelease: true,
  assets: [
    asset("CMTrace-Open_Nightly_20260715_1234_abcdef_x64-setup.exe", 5),
  ],
});

const DRAFT_RELEASE = release({
  tag_name: "v1.5.0-draft",
  draft: true,
  assets: [asset("CMTrace-Open_1.5.0_x64.msi", 10_000)],
});

const UNRELATED_PRERELEASE = release({
  tag_name: "v2.0.0-beta.1",
  prerelease: true,
  assets: [asset("CMTrace.Open_2.0.0_aarch64.dmg", 10_000)],
});

const FIRST_RELEASE_PAGE = [
  DRAFT_RELEASE,
  CURRENT_NIGHTLY_RELEASE,
  UNRELATED_PRERELEASE,
  ...Array.from({ length: 97 }, (_, index) =>
    release({ tag_name: `draft-fixture-${index}`, draft: true }),
  ),
];

function responseJson(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function asFetcher(
  implementation: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return implementation(url, init);
  }) as unknown as typeof fetch;
}

function fixtureFetcher(): typeof fetch {
  return asFetcher(async (url) => {
    if (url === GITHUB_REPOSITORY_API) {
      return responseJson({ stargazers_count: 229 });
    }
    if (url === `${RELEASES_API}?per_page=100&page=1`) {
      return responseJson(FIRST_RELEASE_PAGE);
    }
    if (url === `${RELEASES_API}?per_page=100&page=2`) {
      return responseJson([STABLE_RELEASE]);
    }
    throw new Error(`Unexpected GitHub URL: ${url}`);
  });
}

describe("readGithubStats", () => {
  it("aggregates stars and only human-installable stable and current-nightly packages across release pages", async () => {
    const fetcher = fixtureFetcher();

    const result = await readGithubStats(fetcher);

    expect(result).toEqual({
      stars: 229,
      packageDownloads: {
        total: 32,
        stable: 27,
        currentNightly: 5,
        byPlatform: { windows: 17, macos: 8, linux: 7 },
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/adamgell/cmtraceopen/releases?per_page=100&page=2",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "229", null])(
    "rejects malformed stargazers_count value %s with a local error",
    async (stargazersCount) => {
      const fetcher = asFetcher(async (url) => {
        if (url === GITHUB_REPOSITORY_API) {
          return responseJson({ stargazers_count: stargazersCount });
        }
        throw new Error(`Unexpected GitHub URL: ${url}`);
      });

      await expect(readGithubStats(fetcher)).rejects.toThrow(
        "Invalid GitHub provider data",
      );
    },
  );

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "12", null])(
    "rejects malformed asset download_count value %s with a local error",
    async (downloadCount) => {
      const fetcher = asFetcher(async (url) => {
        if (url === GITHUB_REPOSITORY_API) {
          return responseJson({ stargazers_count: 229 });
        }
        if (url === `${RELEASES_API}?per_page=100&page=1`) {
          return responseJson([
            release({
              assets: [
                {
                  name: "CMTrace-Open_1.4.0_x64-setup.exe",
                  download_count: downloadCount,
                },
              ],
            }),
          ]);
        }
        throw new Error(`Unexpected GitHub URL: ${url}`);
      });

      await expect(readGithubStats(fetcher)).rejects.toThrow(
        "Invalid GitHub provider data",
      );
    },
  );

  it("does not expose a provider response body when a request fails", async () => {
    const fetcher = asFetcher(async () =>
      responseJson({ message: "private provider detail" }, 503),
    );

    const error = await readGithubStats(fetcher).catch((caught: unknown) => caught);

    expect(error).toEqual(new Error("GitHub provider request failed"));
    expect(String(error)).not.toContain("private provider detail");
  });
});
