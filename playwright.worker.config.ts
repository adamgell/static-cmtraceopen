import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "worker-browser.spec.ts",
  webServer: {
    command: "npm run preview:worker",
    url: "http://localhost:8787",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "worker-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
