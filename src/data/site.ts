export type NavItem = { label: string; href: string; external?: boolean };
export type Workflow = { slug: string; label: string; summary: string; evidence: readonly string[] };
export type Guide = { title: string; summary: string; href: string };

export const SITE = {
  name: "CMTrace Open",
  origin: "https://cmtraceopen.com",
  download: "https://download.cmtraceopen.com/",
  nightly: "https://cmtraceopen.com/nightly/",
  repository: "https://github.com/adamgell/cmtraceopen",
} as const;

export const NAV_ITEMS = [
  { label: "Product", href: "/" },
  { label: "Field Guide", href: "/field-guide/" },
  { label: "Nightly", href: "/nightly/" },
  { label: "GitHub", href: SITE.repository, external: true },
  {
    label: "Download",
    href: `${SITE.download}?source=cmtraceopen-product`,
    external: true,
  },
] as const satisfies readonly NavItem[];

export const WORKFLOWS = [
  {
    slug: "intune-app-delivery",
    label: "Intune application delivery",
    summary: "Follow application detection, content staging, and installer execution as one ordered investigation.",
    evidence: ["IntuneManagementExtension.log", "AppWorkload.log", "AgentExecutor.log"],
  },
  {
    slug: "device-identity",
    label: "Device identity and join",
    summary: "Read join state, registration events, and token evidence together when device identity drifts.",
    evidence: ["DSRegCmd", "User Device Registration", "PRT and join state"],
  },
  {
    slug: "software-deployment",
    label: "Software deployment",
    summary: "Connect package-engine output with wrapper and bootstrapper activity to isolate deployment failures.",
    evidence: ["MSI verbose logs", "PSADT logs", "WiX Burn bundles"],
  },
  {
    slug: "windows-setup",
    label: "Windows setup and servicing",
    summary: "Trace setup and component-servicing failures across the Windows evidence chain.",
    evidence: ["Panther logs", "DISM.log", "CBS.log"],
  },
] as const satisfies readonly Workflow[];

export const GUIDES = [
  {
    title: "Why CMTrace Open Exists",
    summary: "Why modern endpoint investigations need more than the original Windows-only CMTrace workflow.",
    href: "/field-guide/why-cmtrace-open-exists/",
  },
  {
    title: "Your First 5 Minutes with CMTrace Open",
    summary: "Go from installation to opening a log and decoding your first error.",
    href: "/field-guide/5-minutes-cmtrace-open/",
  },
  {
    title: "Log Formats: How Auto-Detection Works",
    summary: "See how CMTrace Open identifies structured Windows log formats automatically.",
    href: "/field-guide/log-formats-how-auto-detection-works/",
  },
  {
    title: "Known Log Sources: Stop Hunting for File Paths",
    summary: "Use the built-in source catalog to open the evidence you need without memorizing every path.",
    href: "/field-guide/known-log-sources/",
  },
  {
    title: "Real-Time Tailing: Watch Logs as They Happen",
    summary: "Watch new log entries arrive while reproducing a live endpoint problem.",
    href: "/field-guide/real-time-tailing/",
  },
] as const satisfies readonly Guide[];

export const PRIVACY_STATEMENT = "CMTrace Open requires no account and sends no analytics, usage, device, crash, identity, or behavioral telemetry when it runs. GitHub provides aggregate release-asset download counts. The download website records aggregate uses of download links without storing IP addresses, cookies, user-agent strings, fingerprints, full referrers, or persistent identifiers. The application never sends data to the download analytics system.";
