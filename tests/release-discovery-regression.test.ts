import { describe, expect, it, vi } from "vitest";
import { getStableRelease } from "../src/lib/releases/github";
import { classifyAsset } from "../src/lib/releases/classify";
import release from "./fixtures/release-1.6.3-observed.json";

describe("published 1.6.3 discovery regression", () => {
  it("accepts the exact published stable asset inventory", async () => {
    const fetcher = vi.fn(async () => Response.json(release)) as unknown as typeof fetch;
    const result = await getStableRelease(new Request("https://release-163-regression.example.test/"), fetcher);
    expect(result.tag).toBe("v1.6.3");
    expect(result.assets).toHaveLength(27);
  });
  it.each([
    ["appimage-abi-1.6.3.json", "release-evidence"],
    ["macos-trust-1.6.3.json", "release-evidence"],
    ["event-log-export-1.6.3-aarch64-apple-darwin", "headless-exporter"],
    ["event-log-export-1.6.3-x86_64-pc-windows-msvc.exe", "headless-exporter"],
    ["event-log-export-1.6.3-x86_64-unknown-linux-gnu", "headless-exporter"],
  ])("keeps %s in technical files", (name, packageType) => {
    expect(classifyAsset(name)).toMatchObject({ packageType, deliveryRole: "supporting-file", edition: "not-applicable" });
  });
  it.each(["appimage-abi-1.6.3.json.exe", "macos-trust-anything.json", "event-log-export-1.6.3-mips-unknown-linux-gnu"])("rejects unsupported technical filename %s", name => {
    expect(classifyAsset(name).packageType).toBe("unknown");
  });
});
