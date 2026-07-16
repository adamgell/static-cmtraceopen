import type { PublicStats } from "../lib/stats/types";

const UNAVAILABLE = "Temporarily unavailable";
const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fullNumber = new Intl.NumberFormat("en");
const timestamp = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

const SOURCE_LABELS = {
  "download-home": "Download home",
  "github-readme": "GitHub README",
  "github-release": "GitHub release",
  "cmtraceopen-product": "CMTrace Open product",
  "nightly-builds-page": "Nightly builds page",
  "project-docs": "Project documentation",
} as const;

type JsonObject = Record<string, unknown>;
type StatsRoot = HTMLElement & { dataset: { mode?: string } };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNullableCount(value: unknown): value is number | null {
  return value === null || isCount(value);
}

function isStatus(value: unknown): value is "fresh" | "stale" | "unavailable" {
  return value === "fresh" || value === "stale" || value === "unavailable";
}

function isTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function isGeneratedTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function hasCounts(value: unknown, keys: readonly string[]): value is Record<string, number> {
  return isObject(value) && keys.every((key) => isCount(value[key]));
}

function isPackageDownloads(value: unknown): boolean {
  return value === null || (
    isObject(value) &&
    isCount(value.total) &&
    isCount(value.stable) &&
    isCount(value.currentNightly) &&
    hasCounts(value.byPlatform, ["windows", "macos", "linux"])
  );
}

function isSourceCounts(value: unknown): value is Record<string, number> {
  return isObject(value) && Object.values(value).every(isCount);
}

function isPublicStats(value: unknown): value is PublicStats {
  if (!isObject(value) || !isGeneratedTimestamp(value.generatedAt)) return false;
  if (!isObject(value.github) || !isObject(value.selections)) return false;

  const github = value.github;
  const selections = value.selections;
  return (
    isStatus(github.status) &&
    isTimestamp(github.updatedAt) &&
    isNullableCount(github.stars) &&
    isPackageDownloads(github.packageDownloads) &&
    isStatus(selections.status) &&
    isTimestamp(selections.updatedAt) &&
    selections.windowDays === 30 &&
    isNullableCount(selections.total) &&
    (selections.byChannel === null || hasCounts(selections.byChannel, ["stable", "nightly"])) &&
    (selections.byPlatform === null || hasCounts(selections.byPlatform, ["windows", "macos", "linux"])) &&
    (selections.bySource === null || isSourceCounts(selections.bySource))
  );
}

function setText(root: StatsRoot, hook: string, value: string): void {
  root.querySelectorAll<HTMLElement>(`[data-stat="${hook}"]`).forEach((element) => {
    element.textContent = value;
    element.classList.toggle("stat-unavailable", value === UNAVAILABLE);
  });
}

function displayCount(value: number | null | undefined, formatter: Intl.NumberFormat): string {
  return typeof value === "number" ? formatter.format(value) : UNAVAILABLE;
}

function displayStatus(value: PublicStats["github"]["status"]): string {
  if (value === "fresh") return "Fresh";
  if (value === "stale") return "Stale";
  return UNAVAILABLE;
}

function displayTimestamp(value: string | null): string {
  return value ? timestamp.format(new Date(value)) : UNAVAILABLE;
}

function renderSources(root: StatsRoot, values: Record<string, number> | null): void {
  const body = root.querySelector<HTMLTableSectionElement>('[data-stat="selection-source-body"]');
  if (!body) return;

  body.replaceChildren();
  if (!values) {
    const row = document.createElement("tr");
    row.dataset.stat = "selection-source-unavailable";
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = "Known project sources";
    const value = document.createElement("td");
    value.textContent = UNAVAILABLE;
    row.appendChild(label);
    row.appendChild(value);
    body.appendChild(row);
    return;
  }

  const knownEntries = Object.entries(SOURCE_LABELS).filter(([source]) => source in values);
  if (knownEntries.length === 0) {
    const row = document.createElement("tr");
    row.dataset.stat = "selection-source-empty";
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = "No verified selections recorded";
    const value = document.createElement("td");
    value.textContent = fullNumber.format(0);
    row.appendChild(label);
    row.appendChild(value);
    body.appendChild(row);
    return;
  }

  for (const [source, displayName] of knownEntries) {
    const row = document.createElement("tr");
    row.dataset.stat = `selection-source-${source}`;
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = displayName;
    const value = document.createElement("td");
    value.textContent = fullNumber.format(values[source]);
    row.appendChild(label);
    row.appendChild(value);
    body.appendChild(row);
  }
}

function renderUnavailable(root: StatsRoot): void {
  for (const hook of [
    "package-total", "stars", "selection-total", "github-stable", "github-current-nightly",
    "github-windows", "github-macos", "github-linux", "selection-stable", "selection-nightly",
    "selection-windows", "selection-macos", "selection-linux", "github-status",
    "github-updated-at", "selections-status", "selections-updated-at",
  ]) {
    setText(root, hook, UNAVAILABLE);
  }
  renderSources(root, null);
  const liveStatus = root.querySelector<HTMLElement>("[data-stats-status]");
  if (liveStatus) liveStatus.textContent = "Stats temporarily unavailable.";
}

function render(root: StatsRoot, stats: PublicStats): void {
  const formatter = root.dataset.mode === "summary" ? compactNumber : fullNumber;
  setText(root, "package-total", displayCount(stats.github.packageDownloads?.total, formatter));
  setText(root, "stars", displayCount(stats.github.stars, formatter));
  setText(root, "selection-total", displayCount(stats.selections.total, formatter));

  setText(root, "github-stable", displayCount(stats.github.packageDownloads?.stable, fullNumber));
  setText(root, "github-current-nightly", displayCount(stats.github.packageDownloads?.currentNightly, fullNumber));
  setText(root, "github-windows", displayCount(stats.github.packageDownloads?.byPlatform.windows, fullNumber));
  setText(root, "github-macos", displayCount(stats.github.packageDownloads?.byPlatform.macos, fullNumber));
  setText(root, "github-linux", displayCount(stats.github.packageDownloads?.byPlatform.linux, fullNumber));

  setText(root, "selection-stable", displayCount(stats.selections.byChannel?.stable, fullNumber));
  setText(root, "selection-nightly", displayCount(stats.selections.byChannel?.nightly, fullNumber));
  setText(root, "selection-windows", displayCount(stats.selections.byPlatform?.windows, fullNumber));
  setText(root, "selection-macos", displayCount(stats.selections.byPlatform?.macos, fullNumber));
  setText(root, "selection-linux", displayCount(stats.selections.byPlatform?.linux, fullNumber));
  renderSources(root, stats.selections.bySource);

  setText(root, "github-status", displayStatus(stats.github.status));
  setText(root, "github-updated-at", displayTimestamp(stats.github.updatedAt));
  setText(root, "selections-status", displayStatus(stats.selections.status));
  setText(root, "selections-updated-at", displayTimestamp(stats.selections.updatedAt));

  const hasUnavailable = stats.github.status === "unavailable" || stats.selections.status === "unavailable";
  const liveStatus = root.querySelector<HTMLElement>("[data-stats-status]");
  if (liveStatus) {
    liveStatus.textContent = hasUnavailable
      ? "Project stats loaded with some data temporarily unavailable."
      : "Project stats loaded.";
  }
}

const roots = [...document.querySelectorAll<StatsRoot>("[data-project-stats]")];
if (roots.length > 0) {
  fetch("/api/stats", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error("Stats request failed");
      const value: unknown = await response.json();
      if (!isPublicStats(value)) throw new Error("Invalid stats response");
      return value;
    })
    .then((stats) => roots.forEach((root) => render(root, stats)))
    .catch(() => roots.forEach(renderUnavailable));
}
