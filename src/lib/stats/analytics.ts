import { SOURCE_LABELS } from "../releases/classify";
import type { SourceLabel } from "../releases/types";
import type {
  PublicChannel,
  PublicPlatform,
  SelectionStats,
} from "./types";

export const ANALYTICS_DATASET = "cmtraceopen_download_events";

const ANALYTICS_QUERY = `SELECT
  blob3 AS channel,
  blob5 AS platform,
  blob9 AS source,
  SUM(_sample_interval * double1) AS selections
FROM cmtraceopen_download_events
WHERE timestamp >= NOW() - INTERVAL '30' DAY
  AND blob9 != 'unknown'
GROUP BY channel, platform, source
ORDER BY selections DESC
FORMAT JSON`;

const CHANNELS = new Set<PublicChannel>(["stable", "nightly"]);
const PLATFORMS = new Set<PublicPlatform>([
  "windows",
  "macos",
  "linux",
]);

type JsonObject = Record<string, unknown>;

function invalidProviderData(): Error {
  return new Error("Invalid Analytics Engine provider data");
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addCount(current: number, increment: number): number {
  const next = current + increment;
  if (!Number.isFinite(next)) {
    throw invalidProviderData();
  }
  return next;
}

function aggregateSelectionStats(value: unknown): SelectionStats {
  if (
    !isJsonObject(value) ||
    !Array.isArray(value.meta) ||
    !Array.isArray(value.data) ||
    !Number.isSafeInteger(value.rows) ||
    (value.rows as number) < 0 ||
    value.rows !== value.data.length
  ) {
    throw invalidProviderData();
  }

  const result: SelectionStats = {
    windowDays: 30,
    total: 0,
    byChannel: { stable: 0, nightly: 0 },
    byPlatform: { windows: 0, macos: 0, linux: 0 },
    bySource: {},
  };

  for (const row of value.data) {
    if (
      !isJsonObject(row) ||
      typeof row.channel !== "string" ||
      !CHANNELS.has(row.channel as PublicChannel) ||
      typeof row.platform !== "string" ||
      !PLATFORMS.has(row.platform as PublicPlatform) ||
      typeof row.source !== "string" ||
      !SOURCE_LABELS.has(row.source as SourceLabel) ||
      typeof row.selections !== "number" ||
      !Number.isFinite(row.selections) ||
      row.selections < 0
    ) {
      throw invalidProviderData();
    }

    const channel = row.channel as PublicChannel;
    const platform = row.platform as PublicPlatform;
    const selections = row.selections;

    result.total = addCount(result.total, selections);
    result.byChannel[channel] = addCount(
      result.byChannel[channel],
      selections,
    );
    result.byPlatform[platform] = addCount(
      result.byPlatform[platform],
      selections,
    );
    result.bySource[row.source] = addCount(
      result.bySource[row.source] ?? 0,
      selections,
    );
  }

  return result;
}

export async function readSelectionStats(
  accountId: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<SelectionStats> {
  if (accountId.trim() === "" || token.trim() === "") {
    throw new Error("Missing Analytics Engine credentials");
  }

  let response: Response;
  try {
    response = await fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: ANALYTICS_QUERY,
      },
    );
  } catch {
    throw new Error("Analytics Engine provider request failed");
  }

  if (!response.ok) {
    throw new Error("Analytics Engine provider request failed");
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw invalidProviderData();
  }

  return aggregateSelectionStats(value);
}
