export type ProviderStatus = "fresh" | "stale" | "unavailable";
export type PublicPlatform = "windows" | "macos" | "linux";
export type PublicChannel = "stable" | "nightly";

export type PlatformCounts = Record<PublicPlatform, number>;
export type ChannelCounts = Record<PublicChannel, number>;

export type PackageDownloadCounts = {
  total: number;
  stable: number;
  currentNightly: number;
  byPlatform: PlatformCounts;
};

export type GithubStats = {
  stars: number;
  packageDownloads: PackageDownloadCounts;
};

export type SelectionStats = {
  windowDays: 30;
  total: number;
  byChannel: ChannelCounts;
  byPlatform: PlatformCounts;
  bySource: Record<string, number>;
};

export type PublicStats = {
  generatedAt: string;
  github: {
    status: ProviderStatus;
    updatedAt: string | null;
    stars: number | null;
    packageDownloads: PackageDownloadCounts | null;
  };
  selections: {
    status: ProviderStatus;
    updatedAt: string | null;
    windowDays: 30;
    total: number | null;
    byChannel: ChannelCounts | null;
    byPlatform: PlatformCounts | null;
    bySource: Record<string, number> | null;
  };
};
