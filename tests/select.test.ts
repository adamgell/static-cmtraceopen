import { describe, expect, it } from "vitest";

import { classifyAsset } from "../src/lib/releases/classify";
import { findAsset, type AssetSpec } from "../src/lib/releases/select";
import type { NormalizedRelease } from "../src/lib/releases/types";

// The published v1.5.0 asset set, verified against `gh release view v1.5.0`.
// Kept literal here rather than in tests/fixtures/release-assets.json, which is
// the cross-repository classification contract and must not grow for selection tests.
const V1_5_0 = [
  "CMTrace-Open-Lite_1.5.0_arm64.exe",
  "CMTrace-Open-Lite_1.5.0_x64.exe",
  "CMTrace-Open_1.5.0_arm64-setup.exe",
  "CMTrace-Open_1.5.0_arm64.exe",
  "CMTrace-Open_1.5.0_arm64.msi",
  "CMTrace-Open_1.5.0_x64-setup.exe",
  "CMTrace-Open_1.5.0_x64.exe",
  "CMTrace-Open_1.5.0_x64.msi",
  "CMTrace.Open-1.5.0-1.x86_64.rpm",
  "CMTrace.Open-1.5.0-1.x86_64.rpm.sig",
  "CMTrace.Open_1.5.0_aarch64.app.tar.gz",
  "CMTrace.Open_1.5.0_aarch64.app.tar.gz.sig",
  "CMTrace.Open_1.5.0_aarch64.dmg",
  "CMTrace.Open_1.5.0_amd64.AppImage",
  "CMTrace.Open_1.5.0_amd64.AppImage.sig",
  "CMTrace.Open_1.5.0_amd64.deb",
  "CMTrace.Open_1.5.0_amd64.deb.sig",
  "latest.json",
  "sbom-npm.cdx.json",
  "sbom-rust.cdx.json",
];

const WINDOWS_X64_FULL_EXE: AssetSpec = {
  platform: "windows",
  architecture: "x64",
  edition: "full",
  packageType: "portable-exe",
};

function releaseOf(names: string[]): NormalizedRelease {
  return {
    tag: "v1.5.0",
    name: "CMTrace Open 1.5.0",
    publishedAt: "2026-07-27T00:00:00Z",
    htmlUrl: "https://github.com/adamgell/cmtraceopen/releases/tag/v1.5.0",
    assets: names.map((name, index) => ({
      ...classifyAsset(name),
      id: index + 1,
      name,
      size: 1024,
      contentType: "application/octet-stream",
      browserDownloadUrl: `https://github.com/adamgell/cmtraceopen/releases/download/v1.5.0/${name}`,
      releaseTag: "v1.5.0",
      channel: "stable",
      publishedAt: "2026-07-27T00:00:00Z",
    })),
  };
}

describe("shortlink asset selection", () => {
  const release = releaseOf(V1_5_0);

  it.each([
    ["windows x64 full portable exe", WINDOWS_X64_FULL_EXE, "CMTrace-Open_1.5.0_x64.exe"],
    [
      "windows arm64 full portable exe",
      { platform: "windows", architecture: "arm64", edition: "full", packageType: "portable-exe" },
      "CMTrace-Open_1.5.0_arm64.exe",
    ],
    [
      "windows x64 lite portable exe",
      { platform: "windows", architecture: "x64", edition: "lite", packageType: "portable-exe" },
      "CMTrace-Open-Lite_1.5.0_x64.exe",
    ],
    [
      "macos arm64 dmg",
      { platform: "macos", architecture: "arm64", edition: "full", packageType: "dmg" },
      "CMTrace.Open_1.5.0_aarch64.dmg",
    ],
    [
      "windows x64 msi",
      { platform: "windows", architecture: "x64", edition: "full", packageType: "msi" },
      "CMTrace-Open_1.5.0_x64.msi",
    ],
  ] as [string, AssetSpec, string][])("selects the %s", (_label, spec, expected) => {
    expect(findAsset(release, spec)?.name).toBe(expected);
  });

  it("never serves the lite build for a full request", () => {
    expect(findAsset(release, WINDOWS_X64_FULL_EXE)?.name).not.toBe(
      "CMTrace-Open-Lite_1.5.0_x64.exe",
    );
  });

  it("never serves the nsis installer for a portable request", () => {
    expect(findAsset(release, WINDOWS_X64_FULL_EXE)?.name).not.toBe(
      "CMTrace-Open_1.5.0_x64-setup.exe",
    );
  });

  it("returns the download url from the release payload", () => {
    expect(findAsset(release, WINDOWS_X64_FULL_EXE)?.browserDownloadUrl).toBe(
      "https://github.com/adamgell/cmtraceopen/releases/download/v1.5.0/CMTrace-Open_1.5.0_x64.exe",
    );
  });

  it("returns null when the architecture failed to build", () => {
    const partial = releaseOf(V1_5_0.filter((name) => name !== "CMTrace-Open_1.5.0_arm64.exe"));

    expect(
      findAsset(partial, {
        platform: "windows",
        architecture: "arm64",
        edition: "full",
        packageType: "portable-exe",
      }),
    ).toBeNull();
  });

  it("refuses to guess when two assets share a classification", () => {
    const ambiguous = releaseOf([...V1_5_0, "CMTrace-Open_1.5.1_x64.exe"]);

    expect(findAsset(ambiguous, WINDOWS_X64_FULL_EXE)).toBeNull();
  });

  it.each([
    [
      "updater-only archive",
      { platform: "macos", architecture: "arm64", edition: "full", packageType: "updater-archive" },
    ],
    [
      "supporting-file signature",
      { platform: "linux", architecture: "x64", edition: "full", packageType: "signature" },
    ],
    [
      "updater manifest",
      {
        platform: "cross-platform",
        architecture: "unknown",
        edition: "not-applicable",
        packageType: "updater-manifest",
      },
    ],
    [
      "sbom",
      {
        platform: "cross-platform",
        architecture: "unknown",
        edition: "not-applicable",
        packageType: "sbom",
      },
    ],
  ] as [string, AssetSpec][])("never serves a %s", (_label, spec) => {
    expect(findAsset(release, spec)).toBeNull();
  });
});
