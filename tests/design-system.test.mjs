import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const tokens = await source("src/styles/tokens.css");
const globalStyles = await source("src/styles/global.css");
const productLayout = await source("src/layouts/ProductLayout.astro");

test("publishes the exact Signal Room token contract", () => {
  const requiredTokens = {
    "--ink-950": "#071014",
    "--ink-900": "#091519",
    "--ink-850": "#0a1d21",
    "--line": "#24474a",
    "--line-strong": "#3e8582",
    "--cyan": "#4de5dc",
    "--cyan-ink": "#042122",
    "--text": "#ecfbfa",
    "--text-muted": "#789496",
    "--text-dim": "#547376",
    "--failure": "#ff6b6b",
    "--trust": "#dff7ed",
    "--trust-ink": "#092d2b",
    "--success": "#73e8b0",
    "--font-sans": '"Archivo Variable", "Arial", sans-serif',
    "--font-mono": '"IBM Plex Mono", "Consolas", monospace',
    "--content-width": "1180px",
    "--focus-ring": "0 0 0 3px #071014, 0 0 0 5px #4de5dc",
  };

  for (const [name, value] of Object.entries(requiredTokens)) {
    assert.ok(tokens.includes(`${name}: ${value};`), `${name} must equal ${value}`);
  }
});

test("publishes the shared responsive style contract", () => {
  for (const className of [
    "button",
    "technical-label",
    "evidence-grid",
    "section-rule",
    "editorial-row",
    "focus-ring",
    "sr-only",
  ]) {
    assert.match(globalStyles, new RegExp(`\\.${className}(?=[\\s:{])`));
  }

  assert.match(globalStyles, /:focus-visible\s*{[^}]*outline:\s*0;[^}]*box-shadow:\s*var\(--focus-ring\);[^}]*}/s);
  assert.match(globalStyles, /\.evidence-grid::before\s*{[^}]*background-image:\s*linear-gradient\(rgb\(77 229 220 \/ 3\.5%\) 1px, transparent 1px\),\s*linear-gradient\(90deg, rgb\(77 229 220 \/ 3\.5%\) 1px, transparent 1px\);[^}]*background-size:\s*28px 28px;[^}]*mask-image:\s*linear-gradient\(to bottom, #000, transparent 72%\);[^}]*}/s);
  assert.match(globalStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*scroll-behavior:\s*auto\s*!important;[\s\S]*animation-duration:\s*0\.01ms\s*!important;[\s\S]*animation-iteration-count:\s*1\s*!important;[\s\S]*transition-duration:\s*0\.01ms\s*!important;[\s\S]*}/);

  for (const breakpoint of ["1180px", "900px", "640px"]) {
    assert.match(globalStyles, new RegExp(`@media\\s*\\(max-width:\\s*${breakpoint}\\)`));
  }
});

test("loads both fonts from package-local CSS", () => {
  assert.match(productLayout, /import\s+["']@fontsource-variable\/archivo\/index\.css["'];/);
  assert.match(productLayout, /import\s+["']@fontsource\/ibm-plex-mono\/500\.css["'];/);
  assert.match(productLayout, /import\s+["']\.\.\/styles\/global\.css["'];/);
  assert.doesNotMatch(productLayout, /fonts\.(?:googleapis|gstatic)\.com/);
});

test("ships nonempty copies of the real product media", async () => {
  for (const filename of ["cmtrace-screenshot.png", "cmtrace-logo.png"]) {
    const asset = await stat(new URL(`../public/images/${filename}`, import.meta.url));
    assert.ok(asset.isFile(), `${filename} must be a file`);
    assert.ok(asset.size > 0, `${filename} must be nonempty`);
  }
});
