import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = (path) => readFile(new URL(`../dist/${path}`, import.meta.url), "utf8");
const routeExpectations = new Map([
  ["privacy/index.html", ["No runtime telemetry", "without storing IP addresses"]],
  ["field-guide/index.html", ["Field Guide", "Why CMTrace Open Exists", "Known Log Sources"]],
  ["field-guide/why-cmtrace-open-exists/index.html", ["Why CMTrace Open Exists", "What Makes CMTrace Open Different"]],
  ["field-guide/5-minutes-cmtrace-open/index.html", ["Your First 5 Minutes with CMTrace Open", "Keyboard Shortcuts"]],
  ["field-guide/log-formats-how-auto-detection-works/index.html", ["Log Formats: How Auto-Detection Works", "Format Reference"]],
  ["field-guide/known-log-sources/index.html", ["Known Log Sources: Stop Hunting for File Paths", "Windows Sources"]],
  ["field-guide/real-time-tailing/index.html", ["Real-Time Tailing: Watch Logs as They Happen", "Pause and Resume"]],
  ["download/index.html", ["Continue to the stable download center", "https://download.cmtraceopen.com/?source=cmtraceopen-product"]],
  ["nightly/index.html", ["NIGHTLY CHANNEL · DEVELOPMENT BUILDS", "Builds from main, ready for testing."]],
]);

const workflowExpectations = new Map([
  ["workflows/intune-app-delivery/index.html", ["Intune application delivery", "IntuneManagementExtension.log", "AgentExecutor.log"]],
  ["workflows/device-identity/index.html", ["Device identity and join", "DSRegCmd", "PRT"]],
  ["workflows/software-deployment/index.html", ["Software deployment", "MSI", "PSADT", "Burn"]],
  ["workflows/windows-setup/index.html", ["Windows setup and servicing", "Panther", "DISM", "CBS"]],
]);

test("homepage publishes the product contract", async () => {
  const page = await html("index.html");
  const footer = page.match(/<footer>.*<\/footer>/s)?.[0];

  assert.match(
    page,
    /<a[^>]+aria-label="CMTrace Open home"[^>]*>\s*<img[^>]+class="brand-mark"[^>]+src="\/images\/cmtrace-logo\.png"[^>]+alt=""[^>]*>/,
  );
  assert.match(page, /Windows logs shouldn&#39;t require archaeology\.|Windows logs shouldn’t require archaeology\./);
  assert.match(page, /No account required\. No runtime telemetry collected\./);
  assert.ok(footer, "homepage must render a footer");
  assert.match(footer, /<a href="https:\/\/download\.cmtraceopen\.com\/\?source=cmtraceopen-product">Download<\/a>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/cmtraceopen\.com\/"/);

  for (const text of [
    "Local-first analysis",
    "No runtime telemetry",
    "No account required",
    "Open-source code and release pipeline",
  ]) assert.match(page, new RegExp(text.replaceAll(".", "\\.")));

  assert.doesNotMatch(page, /INCIDENT 01 · INTUNE APPLICATION DELIVERY|ENDPOINT WORKFLOW DEPTH/);
  assert.doesNotMatch(page, /NATIVE ENDPOINT EVIDENCE/);
  assert.doesNotMatch(page, /Take the investigation workspace with you|CURRENT STABLE RELEASE · WINDOWS · MACOS · LINUX/);
  assert.doesNotMatch(page, /href="\/releases\/"|>Releases<\/a>/);
  assert.match(page, /href="\/field-guide\/">Field Guide<\/a>/);
  assert.doesNotMatch(page, /downloads? this (week|month)|GitHub stars|formats supported|errors decoded/i);
});

test("product trust and resource routes publish canonical destinations", async () => {
  for (const [path, expectedContent] of routeExpectations) {
    const page = await html(path);
    const canonicalPath = path.replace("index.html", "");

    assert.match(page, new RegExp(`<link rel="canonical" href="https://cmtraceopen\\.com/${canonicalPath}"`));
    for (const content of expectedContent) assert.ok(page.includes(content), `${path} must contain ${content}`);
  }
});

test("download route keeps its tracked delivery destination", async () => {
  const download = await html("download/index.html");

  assert.match(download, /<a[^>]+href="https:\/\/download\.cmtraceopen\.com\/\?source=cmtraceopen-product"[^>]*>Open stable downloads<\/a>/);
});

test("workflow routes publish investigation evidence and a tracked stable download", async () => {
  for (const [path, expectedContent] of workflowExpectations) {
    const page = await html(path);
    const canonicalPath = path.replace("index.html", "");

    assert.match(page, new RegExp(`<link rel="canonical" href="https://cmtraceopen\\.com/${canonicalPath}"`));
    for (const content of expectedContent) assert.ok(page.includes(content), `${path} must contain ${content}`);
    assert.match(
      page,
      /<a[^>]+href="https:\/\/download\.cmtraceopen\.com\/\?source=cmtraceopen-product"[^>]*>Open stable downloads<\/a>/,
    );
  }
});

test("404 route provides a branded recovery path", async () => {
  const page = await html("404.html");

  assert.match(page, /404 · SIGNAL NOT FOUND/);
  assert.match(page, /CMTrace Open/);
  assert.match(page, /<a[^>]+href="https:\/\/cmtraceopen\.com\/"[^>]*>Return to the product<\/a>/);
  assert.match(page, /<a[^>]+href="https:\/\/cmtraceopen\.com\/field-guide\/"[^>]*>Browse field guides<\/a>/);
});

test("crawler and manifest metadata publish the product discovery contract", async () => {
  const robots = await html("robots.txt");
  const manifest = JSON.parse(await html("site.webmanifest"));

  assert.equal(
    robots,
    "User-agent: *\nAllow: /\n\nSitemap: https://cmtraceopen.com/sitemap-index.xml\n",
  );
  assert.deepEqual(manifest, {
    name: "CMTrace Open",
    start_url: "/",
    display: "browser",
    background_color: "#071014",
    theme_color: "#071014",
  });
});
