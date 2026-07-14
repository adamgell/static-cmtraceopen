import type { ClassifiedReleaseAsset, SourceLabel } from "./types";

export function toAnalyticsDataPoint(
  asset: ClassifiedReleaseAsset,
  source: SourceLabel,
): AnalyticsEngineDataPoint {
  const assetId = String(asset.id);

  return {
    indexes: [assetId],
    blobs: [
      assetId,
      asset.releaseTag,
      asset.channel,
      asset.name,
      asset.platform,
      asset.architecture,
      asset.packageType,
      asset.deliveryRole,
      source,
    ],
    doubles: [1],
  };
}

export function recordDownload(
  dataset: AnalyticsEngineDataset | undefined,
  asset: ClassifiedReleaseAsset,
  source: SourceLabel,
): void {
  try {
    dataset?.writeDataPoint(toAnalyticsDataPoint(asset, source));
  } catch {
    // Analytics is best-effort; a verified download must continue without logging request context.
  }
}
