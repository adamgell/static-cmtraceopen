export const CLASSIFICATION_CONTRACT = "2026-07-13.1" as const;

export type Platform = "windows" | "macos" | "linux" | "cross-platform" | "unknown";
export type Architecture = "x64" | "arm64" | "unknown";
export type Edition = "full" | "lite" | "not-applicable" | "unknown";
export type PackageType =
  | "portable-exe"
  | "msi"
  | "nsis-setup"
  | "dmg"
  | "deb"
  | "rpm"
  | "appimage"
  | "updater-manifest"
  | "updater-archive"
  | "signature"
  | "sbom"
  | "unknown";
export type DeliveryRole =
  | "manual-only"
  | "mixed-manual-update"
  | "updater-only"
  | "supporting-file"
  | "unknown";
export type Channel = "stable" | "nightly";
export type SourceLabel =
  | "download-home"
  | "github-readme"
  | "github-release"
  | "cmtraceopen-product"
  | "nightly-builds-page"
  | "project-docs"
  | "unknown";

export type AssetClassification = {
  platform: Platform;
  architecture: Architecture;
  edition: Edition;
  packageType: PackageType;
  deliveryRole: DeliveryRole;
};

export type ClassifiedReleaseAsset = AssetClassification & {
  id: number;
  name: string;
  size: number;
  contentType: string;
  browserDownloadUrl: string;
  releaseTag: string;
  channel: Channel;
  publishedAt: string;
};

export type NormalizedRelease = {
  tag: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  assets: ClassifiedReleaseAsset[];
};
