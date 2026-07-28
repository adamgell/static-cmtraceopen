import type {
  Architecture,
  ClassifiedReleaseAsset,
  DeliveryRole,
  Edition,
  NormalizedRelease,
  PackageType,
  Platform,
} from "./types";

export type AssetSpec = {
  platform: Platform;
  architecture: Architecture;
  edition: Edition;
  packageType: PackageType;
};

const HUMAN_DELIVERY_ROLES = new Set<DeliveryRole>([
  "manual-only",
  "mixed-manual-update",
]);

export function findAsset(
  release: NormalizedRelease,
  spec: AssetSpec,
): ClassifiedReleaseAsset | null {
  const matches = release.assets.filter(
    (asset) =>
      HUMAN_DELIVERY_ROLES.has(asset.deliveryRole) &&
      asset.platform === spec.platform &&
      asset.architecture === spec.architecture &&
      asset.edition === spec.edition &&
      asset.packageType === spec.packageType,
  );

  return matches.length === 1 ? matches[0] : null;
}
