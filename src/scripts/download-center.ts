import { classifyAsset, normalizeSource, recommendationRank } from "../lib/releases/classify";
import type { ClassifiedReleaseAsset, NormalizedRelease, Platform } from "../lib/releases/types";

type PlatformSelection = Exclude<Platform, "cross-platform" | "unknown"> | "all";

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"][data-platform]'));
const panel = document.querySelector<HTMLElement>("#package-panel");
const status = document.querySelector<HTMLElement>("[data-chooser-status]");
const packageStack = document.querySelector<HTMLElement>("[data-package-stack]");
const technicalFiles = document.querySelector<HTMLElement>("[data-technical-files]");
const technicalList = document.querySelector<HTMLUListElement>("[data-technical-list]");
const releaseName = document.querySelector<HTMLElement>("[data-release-name]");
const releaseDate = document.querySelector<HTMLElement>("[data-release-date]");
const signatureStatus = document.querySelector<HTMLElement>("[data-signature-status]");

const source = normalizeSource(new URL(location.href).searchParams.get("source") ?? "download-home");
let release: NormalizedRelease | null = null;
let selectedPlatform: PlatformSelection = "windows";

const platforms = new Set(["windows", "macos", "linux", "cross-platform"]);
const architectures = new Set(["x64", "arm64", "unknown"]);
const editions = new Set(["full", "lite", "not-applicable"]);
const packageTypes = new Set([
  "portable-exe", "msi", "nsis-setup", "dmg", "deb", "rpm", "appimage",
  "updater-manifest", "updater-archive", "signature", "sbom",
]);
const deliveryRoles = new Set(["manual-only", "mixed-manual-update", "updater-only", "supporting-file"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClassifiedReleaseAsset(value: unknown, releaseTag: string, publishedAt: string): value is ClassifiedReleaseAsset {
  if (!isRecord(value)) return false;
  const hasValidShape = (
    isTrustedAssetId(value.id as number) &&
    typeof value.name === "string" && value.name.length > 0 &&
    typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size >= 0 &&
    typeof value.contentType === "string" &&
    typeof value.browserDownloadUrl === "string" &&
    value.releaseTag === releaseTag &&
    value.channel === "stable" &&
    value.publishedAt === publishedAt &&
    platforms.has(value.platform as string) &&
    architectures.has(value.architecture as string) &&
    editions.has(value.edition as string) &&
    packageTypes.has(value.packageType as string) &&
    deliveryRoles.has(value.deliveryRole as string)
  );
  if (!hasValidShape) return false;

  const expected = classifyAsset(value.name as string);
  if (expected.packageType === "unknown" || expected.deliveryRole === "unknown") return false;
  return (
    value.platform === expected.platform &&
    value.architecture === expected.architecture &&
    value.edition === expected.edition &&
    value.packageType === expected.packageType &&
    value.deliveryRole === expected.deliveryRole
  );
}

function isNormalizedRelease(value: unknown): value is NormalizedRelease {
  if (!isRecord(value)) return false;
  if (
    typeof value.tag !== "string" || value.tag.length === 0 ||
    typeof value.name !== "string" || value.name.length === 0 ||
    typeof value.publishedAt !== "string" || value.publishedAt.length === 0 ||
    typeof value.htmlUrl !== "string" || value.htmlUrl.length === 0 ||
    !Array.isArray(value.assets)
  ) return false;
  return value.assets.every((asset) => isClassifiedReleaseAsset(asset, value.tag as string, value.publishedAt as string));
}

function isTrustedAssetId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function hrefFor(asset: ClassifiedReleaseAsset): string {
  if (!isTrustedAssetId(asset.id)) throw new Error("The release contains an invalid asset ID.");
  return `/asset/${asset.id}?source=${encodeURIComponent(source)}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function architectureLabel(asset: ClassifiedReleaseAsset): string {
  return asset.architecture === "arm64" ? "ARM64" : asset.architecture;
}

function packageCopy(asset: ClassifiedReleaseAsset): { title: string; detail: string; action: string } | null {
  const architecture = architectureLabel(asset);
  if (asset.packageType === "portable-exe" && asset.edition === "full") {
    return {
      title: asset.architecture === "arm64" ? "Portable application for ARM64" : "Full portable application",
      detail: "Run directly without an installer.",
      action: `Download ${architecture}`,
    };
  }
  if (asset.packageType === "portable-exe" && asset.edition === "lite") {
    return { title: "Lite portable application", detail: "A smaller Windows build with the focused log-reading toolset.", action: `Download Lite ${architecture}` };
  }
  if (asset.packageType === "msi") {
    return { title: "Managed deployment package", detail: "MSI packaging for endpoint-management and software-distribution workflows.", action: `Download MSI · ${architecture}` };
  }
  if (asset.packageType === "nsis-setup") {
    return { title: "Guided installer", detail: "A conventional setup experience with updater-compatible installation.", action: `Download setup · ${architecture}` };
  }
  if (asset.packageType === "dmg") {
    return { title: "macOS disk image", detail: "The stable Apple silicon application package.", action: "Download macOS ARM64" };
  }
  if (asset.packageType === "appimage") {
    return { title: "Linux AppImage", detail: "A portable Linux application for x64 systems.", action: "Download Linux x64 AppImage" };
  }
  if (asset.packageType === "deb") {
    return { title: "Debian package", detail: "For Debian, Ubuntu, and compatible x64 systems.", action: "Download Linux x64 DEB" };
  }
  if (asset.packageType === "rpm") {
    return { title: "RPM package", detail: "For Fedora, RHEL, and compatible x64 systems.", action: "Download Linux x64 RPM" };
  }
  return null;
}

function createPackageRow(asset: ClassifiedReleaseAsset): HTMLElement | null {
  const copy = packageCopy(asset);
  if (!copy) return null;
  const article = document.createElement("article");
  article.className = "package-row";

  const heading = document.createElement("div");
  heading.className = "package-heading";
  const title = document.createElement("h3");
  title.textContent = copy.title;
  heading.appendChild(title);
  if (recommendationRank(asset) !== null) {
    const badge = document.createElement("span");
    badge.className = "recommendation";
    badge.textContent = "Recommended";
    heading.appendChild(badge);
  }

  const description = document.createElement("p");
  description.textContent = copy.detail;
  const metadata = document.createElement("p");
  metadata.className = "package-metadata";
  metadata.textContent = `${architectureLabel(asset)} · ${formatBytes(asset.size)} · ${asset.name}`;

  const download = document.createElement("a");
  download.className = "button package-action";
  download.href = hrefFor(asset);
  download.textContent = copy.action;

  const copyColumn = document.createElement("div");
  copyColumn.appendChild(heading);
  copyColumn.appendChild(description);
  copyColumn.appendChild(metadata);
  article.appendChild(copyColumn);
  article.appendChild(download);
  return article;
}

function windowsPackageOrder(asset: ClassifiedReleaseAsset): number {
  const architecture = asset.architecture === "x64" ? 0 : 10;
  const packageType =
    asset.packageType === "portable-exe" && asset.edition === "full"
      ? 0
      : asset.packageType === "msi"
        ? 1
        : asset.packageType === "nsis-setup"
          ? 2
          : 3;
  return architecture + packageType;
}

function createArm64Divider(): HTMLElement {
  const divider = document.createElement("div");
  divider.className = "package-group-label";
  const label = document.createElement("span");
  label.className = "technical-label";
  label.textContent = "ARM64 OPTIONS";
  const heading = document.createElement("h3");
  heading.textContent = "ARM64 packages";
  divider.appendChild(label);
  divider.appendChild(heading);
  return divider;
}

function renderTechnicalFiles(assets: ClassifiedReleaseAsset[]): void {
  if (!technicalFiles || !technicalList) return;
  technicalList.replaceChildren();
  for (const asset of assets) {
    const item = document.createElement("li");
    const name = document.createElement("code");
    name.textContent = asset.name;
    const link = document.createElement("a");
    link.href = hrefFor(asset);
    link.textContent = "Open technical file";
    item.appendChild(name);
    item.appendChild(link);
    technicalList.appendChild(item);
  }
  technicalFiles.hidden = selectedPlatform !== "all" || assets.length === 0;
}

function renderPackages(): void {
  if (!release || !packageStack || !status) return;
  const normalAssets = release.assets.filter(
    (asset) =>
      (asset.deliveryRole === "manual-only" || asset.deliveryRole === "mixed-manual-update") &&
      (selectedPlatform === "all" || asset.platform === selectedPlatform) &&
      isTrustedAssetId(asset.id),
  );
  normalAssets.sort((left, right) => {
    if (selectedPlatform === "windows") {
      return windowsPackageOrder(left) - windowsPackageOrder(right) || left.name.localeCompare(right.name);
    }
    const leftRank = recommendationRank(left) ?? 100;
    const rightRank = recommendationRank(right) ?? 100;
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });

  const packageNodes: HTMLElement[] = [];
  for (const asset of normalAssets) {
    if (
      selectedPlatform === "windows" &&
      asset.architecture === "arm64" &&
      !packageNodes.some((node) => node.classList.contains("package-group-label"))
    ) {
      packageNodes.push(createArm64Divider());
    }
    const row = createPackageRow(asset);
    if (!row) {
      renderError();
      return;
    }
    packageNodes.push(row);
  }
  packageStack.replaceChildren(...packageNodes);
  status.textContent = normalAssets.length === 0 ? "No stable package is currently available for this platform." : "";

  const technicalAssets = release.assets.filter(
    (asset) =>
      (asset.deliveryRole === "updater-only" || asset.deliveryRole === "supporting-file") &&
      isTrustedAssetId(asset.id),
  );
  renderTechnicalFiles(technicalAssets);
}

function activateTab(tab: HTMLButtonElement, focus: boolean): void {
  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.setAttribute("aria-selected", String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  }
  selectedPlatform = tab.dataset.platform as PlatformSelection;
  if (panel) panel.setAttribute("aria-labelledby", tab.id);
  renderPackages();
  if (focus) tab.focus();
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => activateTab(tab, false));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    activateTab(tabs[(index + step + tabs.length) % tabs.length], true);
  });
}

function renderError(): void {
  if (!status || !packageStack || !technicalFiles) return;
  packageStack.replaceChildren();
  technicalFiles.hidden = true;
  status.className = "chooser-error";
  status.textContent = "";

  const heading = document.createElement("h3");
  heading.textContent = "Release discovery is temporarily unavailable";
  const explanation = document.createElement("p");
  explanation.textContent = "No download was selected or counted. You can inspect and download the current release directly from GitHub.";
  const link = document.createElement("a");
  link.className = "button";
  link.href = "https://github.com/adamgell/cmtraceopen/releases";
  link.textContent = "Open GitHub Releases";
  status.appendChild(heading);
  status.appendChild(explanation);
  status.appendChild(link);
  if (releaseName) releaseName.textContent = "Unavailable";
  if (releaseDate) releaseDate.textContent = "See GitHub Releases";
  if (signatureStatus) signatureStatus.textContent = "Unavailable";
}

async function loadRelease(): Promise<void> {
  try {
    const response = await fetch("/api/releases/stable", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Stable release request failed.");
    const payload: unknown = await response.json();
    if (!isNormalizedRelease(payload)) throw new Error("Stable release response is invalid.");
    release = payload;
    if (releaseName) releaseName.textContent = release.name || release.tag;
    if (releaseDate) {
      releaseDate.textContent = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(release.publishedAt));
    }
    if (signatureStatus) {
      signatureStatus.textContent = release.assets.some(
        (asset) => asset.packageType === "signature" && asset.deliveryRole === "supporting-file",
      )
        ? "Detached signatures published"
        : "No detached signatures listed";
    }
    renderPackages();
  } catch {
    renderError();
  }
}

void loadRelease();
