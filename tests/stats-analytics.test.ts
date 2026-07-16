import { describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_DATASET,
  readSelectionStats,
} from "../src/lib/stats/analytics";

const ACCOUNT_ID = "account/id";
const TOKEN = "analytics-token";
const ANALYTICS_API =
  "https://api.cloudflare.com/client/v4/accounts/account%2Fid/analytics_engine/sql";

const SUCCESS_BODY = {
  meta: [],
  data: [
    {
      channel: "stable",
      platform: "windows",
      source: "download-home",
      selections: 7,
    },
    {
      channel: "nightly",
      platform: "macos",
      source: "nightly-builds-page",
      selections: 3,
    },
  ],
  rows: 2,
};

function responseJson(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function asFetcher(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe("readSelectionStats", () => {
  it("requests and aggregates the fixed 30-day allowlisted selection query", async () => {
    const fetcher = asFetcher(responseJson(SUCCESS_BODY));

    const result = await readSelectionStats(ACCOUNT_ID, TOKEN, fetcher);

    expect(ANALYTICS_DATASET).toBe("cmtraceopen_download_events");
    expect(result).toEqual({
      windowDays: 30,
      total: 10,
      byChannel: { stable: 7, nightly: 3 },
      byPlatform: { windows: 7, macos: 3, linux: 0 },
      bySource: { "download-home": 7, "nightly-builds-page": 3 },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      ANALYTICS_API,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "text/plain",
        },
        body: expect.any(String),
      }),
    );

    const request = vi.mocked(fetcher).mock.calls[0]?.[1];
    const query = request?.body;
    expect(typeof query).toBe("string");
    expect(query).toContain("SUM(_sample_interval * double1)");
    expect(query).toContain("FROM cmtraceopen_download_events");
    expect(query).toContain("timestamp >= NOW() - INTERVAL '30' DAY");
    expect(query).toContain("blob9 != 'unknown'");
    expect(query).toMatch(/FORMAT JSON\s*$/);
  });

  it.each([
    ["blank account ID", " ", TOKEN],
    ["blank token", ACCOUNT_ID, "\t"],
  ])("rejects a %s before making a request", async (_label, accountId, token) => {
    const fetcher = asFetcher(responseJson(SUCCESS_BODY));

    await expect(readSelectionStats(accountId, token, fetcher)).rejects.toThrow(
      "Missing Analytics Engine credentials",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not expose provider response details or the token on non-2xx responses", async () => {
    const fakeSecret = "fake-provider-secret";
    const fetcher = asFetcher(
      responseJson({ errors: [{ message: fakeSecret }] }, 503),
    );

    const error = await readSelectionStats(ACCOUNT_ID, TOKEN, fetcher).catch(
      (caught: unknown) => caught,
    );

    expect(error).toEqual(new Error("Analytics Engine provider request failed"));
    expect(String(error)).not.toContain(fakeSecret);
    expect(String(error)).not.toContain(TOKEN);
  });

  it.each([
    ["null body", null],
    ["missing data", { meta: [], rows: 0 }],
    ["non-array data", { meta: [], data: {}, rows: 0 }],
    ["non-object row", { meta: [], data: [null], rows: 1 }],
    [
      "missing selections",
      {
        meta: [],
        data: [
          {
            channel: "stable",
            platform: "windows",
            source: "download-home",
          },
        ],
        rows: 1,
      },
    ],
  ])("rejects malformed provider JSON: %s", async (_label, body) => {
    const fetcher = asFetcher(responseJson(body));

    await expect(
      readSelectionStats(ACCOUNT_ID, TOKEN, fetcher),
    ).rejects.toThrow("Invalid Analytics Engine provider data");
  });

  it.each([
    ["channel", "preview"],
    ["platform", "freebsd"],
    ["source", "external-campaign"],
  ])("rejects an unsupported %s", async (field, value) => {
    const row = { ...SUCCESS_BODY.data[0], [field]: value };
    const fetcher = asFetcher(
      responseJson({ meta: [], data: [row], rows: 1 }),
    );

    await expect(
      readSelectionStats(ACCOUNT_ID, TOKEN, fetcher),
    ).rejects.toThrow("Invalid Analytics Engine provider data");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid selection count %s",
    async (selections) => {
      const fetcher = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          meta: [],
          data: [{ ...SUCCESS_BODY.data[0], selections }],
          rows: 1,
        }),
      })) as unknown as typeof fetch;

      await expect(
        readSelectionStats(ACCOUNT_ID, TOKEN, fetcher),
      ).rejects.toThrow("Invalid Analytics Engine provider data");
    },
  );
});
