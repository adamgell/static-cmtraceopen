export {};

type NightlyAsset = {
  id: number;
  name: string;
  size: number;
  platform: "windows" | "macos" | "linux" | "cross-platform" | "unknown";
  architecture: "x64" | "arm64" | "unknown";
  edition: "full" | "lite" | "not-applicable" | "unknown";
  packageType: string;
  deliveryRole: string;
};

type NightlyRelease = {
  tag: "nightly";
  name: string;
  publishedAt: string;
  htmlUrl: string;
  assets: NightlyAsset[];
};

const groups = document.querySelector<HTMLElement>("[data-nightly-groups]");
const refresh = document.querySelector<HTMLButtonElement>("[data-nightly-refresh]");

const groupOrder = ["Windows x64", "Windows ARM64", "macOS ARM64", "Linux x64"];
const refreshLabel = "Refresh build data";
const refreshCooldownMs = 120_000;
let refreshCooldown: number | undefined;

function isNightlyRelease(value: unknown): value is NightlyRelease {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const release = value as Record<string, unknown>;
  if (
    release.tag !== "nightly" ||
    typeof release.name !== "string" ||
    typeof release.publishedAt !== "string" ||
    typeof release.htmlUrl !== "string" ||
    !Array.isArray(release.assets)
  ) return false;

  return release.assets.every((asset) => {
    if (typeof asset !== "object" || asset === null || Array.isArray(asset)) return false;
    const candidate = asset as Record<string, unknown>;
    return Number.isSafeInteger(candidate.id) && Number(candidate.id) > 0 &&
      typeof candidate.name === "string" &&
      typeof candidate.size === "number" &&
      typeof candidate.platform === "string" &&
      typeof candidate.architecture === "string" &&
      typeof candidate.edition === "string" &&
      typeof candidate.packageType === "string" &&
      typeof candidate.deliveryRole === "string";
  });
}

function humanAssets(release: NightlyRelease): NightlyAsset[] {
  return release.assets.filter((asset) =>
    asset.deliveryRole === "manual-only" || asset.deliveryRole === "mixed-manual-update"
  );
}

function groupName(asset: NightlyAsset): string {
  if (asset.platform === "windows") return asset.architecture === "arm64" ? "Windows ARM64" : "Windows x64";
  if (asset.platform === "macos") return "macOS ARM64";
  if (asset.platform === "linux") return "Linux x64";
  return "Other packages";
}

function packageName(asset: NightlyAsset): string {
  const platform = groupName(asset);
  if (asset.packageType === "portable-exe") return `${platform} ${asset.edition === "lite" ? "Lite" : "portable"}`;
  if (asset.packageType === "msi") return `${platform} MSI`;
  if (asset.packageType === "nsis-setup") return `${platform} setup`;
  if (asset.packageType === "dmg") return `${platform} DMG`;
  if (asset.packageType === "appimage") return `${platform} AppImage`;
  if (asset.packageType === "deb") return `${platform} DEB`;
  if (asset.packageType === "rpm") return `${platform} RPM`;
  return `${platform} package`;
}

function packageDetail(asset: NightlyAsset): string {
  if (asset.packageType === "portable-exe") return asset.edition === "lite" ? "Focused portable Windows build." : "Run directly without an installer.";
  if (asset.packageType === "msi") return "Managed deployment package.";
  if (asset.packageType === "nsis-setup") return "Guided Windows installer.";
  if (asset.packageType === "dmg") return "Apple silicon disk image.";
  if (asset.packageType === "appimage") return "Portable Linux application.";
  if (asset.packageType === "deb") return "Debian and Ubuntu package.";
  if (asset.packageType === "rpm") return "Fedora and RHEL package.";
  return "Development package.";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderPackage(asset: NightlyAsset): HTMLElement {
  const row = element("article", "nightly-package");
  const copy = element("div");
  const heading = element("h4", undefined, packageName(asset));
  const detail = element("p", undefined, packageDetail(asset));
  const metadata = element("p", "nightly-metadata", `${formatBytes(asset.size)} · ${asset.name}`);
  copy.appendChild(heading);
  copy.appendChild(detail);
  copy.appendChild(metadata);

  const link = element("a", "button button-secondary", `Download ${packageName(asset)}`);
  link.href = `https://download.cmtraceopen.com/nightly-asset/${asset.id}?source=nightly-builds-page`;
  row.appendChild(copy);
  row.appendChild(link);
  return row;
}

function renderRelease(release: NightlyRelease): void {
  const assets = humanAssets(release);
  const grouped = new Map<string, NightlyAsset[]>();
  for (const asset of assets) {
    const name = groupName(asset);
    grouped.set(name, [...(grouped.get(name) ?? []), asset]);
  }

  if (!groups) return;

  groups.replaceChildren();
  const names = [...grouped.keys()].sort((left, right) => {
    const leftRank = groupOrder.indexOf(left);
    const rightRank = groupOrder.indexOf(right);
    return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
  });
  for (const name of names) {
    const section = element("section", "nightly-group");
    section.setAttribute("aria-label", `${name} nightly packages`);
    const groupHeading = element("div", "nightly-group-heading");
    groupHeading.appendChild(element("span", "technical-label", "PLATFORM"));
    groupHeading.appendChild(element("h3", undefined, name));
    const rows = element("div", "nightly-package-list");
    for (const asset of grouped.get(name) ?? []) rows.appendChild(renderPackage(asset));
    section.appendChild(groupHeading);
    section.appendChild(rows);
    groups.appendChild(section);
  }
}

function renderError(message: string): void {
  if (groups) {
    const error = element("div", "nightly-error");
    error.appendChild(element("h3", undefined, "Could not load the current nightly release."));
    const copy = element("p", undefined, `${message} You can inspect the nightly workflow directly on GitHub.`);
    const link = element("a", undefined, "Open nightly workflow ↗");
    link.href = "https://github.com/adamgell/cmtraceopen/actions/workflows/cmtrace-nightly-signed.yml";
    error.appendChild(copy);
    error.appendChild(link);
    groups.replaceChildren(error);
  }
}

function startRefreshCooldown(): void {
  if (!refresh) return;
  if (refreshCooldown !== undefined) window.clearTimeout(refreshCooldown);
  refresh.disabled = true;
  refresh.textContent = "Refresh available in 2 minutes";
  refreshCooldown = window.setTimeout(() => {
    refresh.disabled = false;
    refresh.textContent = refreshLabel;
    refreshCooldown = undefined;
  }, refreshCooldownMs);
}

async function loadNightly(manualRefresh = false): Promise<void> {
  if (refresh) refresh.disabled = true;
  try {
    const response = await fetch("/api/releases/nightly", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("GitHub release discovery is temporarily unavailable.");
    const release: unknown = await response.json();
    if (!isNightlyRelease(release)) throw new Error("The nightly release record was not recognized.");
    renderRelease(release);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Nightly release discovery failed.");
  } finally {
    if (manualRefresh) startRefreshCooldown();
    else if (refresh) refresh.disabled = false;
  }
}

refresh?.addEventListener("click", () => void loadNightly(true));
void loadNightly();
