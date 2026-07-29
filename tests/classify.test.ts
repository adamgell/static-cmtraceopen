import { describe, expect, it } from "vitest";

import { classifyAsset, normalizeSource, recommendationRank } from "../src/lib/releases/classify";
import { CLASSIFICATION_CONTRACT, type ClassifiedReleaseAsset } from "../src/lib/releases/types";
import fixture from "./fixtures/release-assets.json";

describe("release asset classification contract", () => {
  it("publishes the fixture contract version", () => {
    expect(CLASSIFICATION_CONTRACT).toBe("2026-07-13.1");
  });

  it.each(fixture.assets)("classifies $name", ({ name, expected }) => {
    expect(classifyAsset(name)).toEqual(expected);
  });

  it.each(fixture.assets)("ranks $name", (asset) => {
    const classified: ClassifiedReleaseAsset = {
      ...classifyAsset(asset.name),
      id: asset.id,
      name: asset.name,
      size: asset.size,
      contentType: asset.content_type,
      browserDownloadUrl: asset.browser_download_url,
      releaseTag: "fixture",
      channel: asset.browser_download_url.includes("/nightly/") ? "nightly" : "stable",
      publishedAt: "2026-07-13T00:00:00Z",
    };

    expect(recommendationRank(classified)).toBe(asset.expected_rank);
  });

  it("leaves an unknown filename out of adoption totals", () => {
    expect(classifyAsset("mystery-download.bin")).toEqual({
      platform: "unknown",
      architecture: "unknown",
      edition: "unknown",
      packageType: "unknown",
      deliveryRole: "unknown",
    });
  });

  it("classifies an otherwise unknown signature as a supporting file", () => {
    expect(classifyAsset("third-party-proof.sig")).toEqual({
      platform: "unknown",
      architecture: "unknown",
      edition: "unknown",
      packageType: "signature",
      deliveryRole: "supporting-file",
    });
  });

  it.each([
    "download-home",
    "github-readme",
    "github-release",
    "cmtraceopen-product",
    "nightly-builds-page",
    "project-docs",
    "cmtrace-net",
  ])("accepts source %s", (source) => {
    expect(normalizeSource(source)).toBe(source);
  });

  it.each([null, "", "newsletter", "user-123", "cmtraceopen-product/extra"])(
    "normalizes arbitrary source %s",
    (source) => {
      expect(normalizeSource(source)).toBe("unknown");
    },
  );
});
