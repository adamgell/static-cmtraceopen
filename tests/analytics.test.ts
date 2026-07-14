import { afterEach, describe, expect, it, vi } from "vitest";

import { recordDownload, toAnalyticsDataPoint } from "../src/lib/releases/analytics";
import type { ClassifiedReleaseAsset } from "../src/lib/releases/types";

const ASSET: ClassifiedReleaseAsset = {
  id: 475711960,
  name: "CMTrace-Open_1.4.0_x64.exe",
  size: 23_561_984,
  contentType: "application/x-msdownload",
  browserDownloadUrl:
    "https://github.com/adamgell/cmtraceopen/releases/download/v1.4.0/CMTrace-Open_1.4.0_x64.exe",
  releaseTag: "v1.4.0",
  channel: "stable",
  publishedAt: "2026-07-01T12:00:00Z",
  platform: "windows",
  architecture: "x64",
  edition: "full",
  packageType: "portable-exe",
  deliveryRole: "manual-only",
};

const EXPECTED_POINT: AnalyticsEngineDataPoint = {
  indexes: ["475711960"],
  blobs: [
    "475711960",
    "v1.4.0",
    "stable",
    "CMTrace-Open_1.4.0_x64.exe",
    "windows",
    "x64",
    "portable-exe",
    "manual-only",
    "github-readme",
  ],
  doubles: [1],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("identifier-free download analytics", () => {
  it("constructs the exact allowlisted event even when hostile request context is supplied", () => {
    const request = new Request(
      "https://download.cmtraceopen.com/asset/475711960?campaign=private-campaign&visitor=private-query-id",
      {
        headers: {
          "CF-Connecting-IP": "203.0.113.42",
          "User-Agent": "private-browser-agent/1.0",
          Cookie: "session=private-cookie-value",
          Referer: "https://private.example/account/history?person=private-referrer-id",
        },
      },
    );

    const event = Reflect.apply(toAnalyticsDataPoint, undefined, [
      ASSET,
      "github-readme",
      request,
    ]) as AnalyticsEngineDataPoint;

    expect(event).toEqual(EXPECTED_POINT);

    const serialized = JSON.stringify(event);
    const forbiddenValues = [
      request.url,
      "CF-Connecting-IP",
      request.headers.get("CF-Connecting-IP"),
      "User-Agent",
      request.headers.get("User-Agent"),
      "Cookie",
      request.headers.get("Cookie"),
      "Referer",
      request.headers.get("Referer"),
      "campaign",
      "private-campaign",
      "visitor",
      "private-query-id",
      "person",
      "private-referrer-id",
    ];

    for (const forbidden of forbiddenValues) {
      expect(forbidden).not.toBeNull();
      expect(serialized).not.toContain(forbidden as string);
    }
  });

  it("writes only the allowlisted event through the Analytics Engine binding", () => {
    const writeDataPoint = vi.fn();
    const dataset = { writeDataPoint } as AnalyticsEngineDataset;

    expect(recordDownload(dataset, ASSET, "github-readme")).toBeUndefined();

    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith(EXPECTED_POINT);
  });

  it("returns quietly when the Analytics Engine binding is missing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(recordDownload(undefined, ASSET, "github-readme")).toBeUndefined();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("never throws or logs when the Analytics Engine write throws", () => {
    const privateFailure = new Error("private request metadata must not be logged");
    const dataset = {
      writeDataPoint: vi.fn(() => {
        throw privateFailure;
      }),
    } as AnalyticsEngineDataset;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(recordDownload(dataset, ASSET, "github-readme")).toBeUndefined();
    expect(dataset.writeDataPoint).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
