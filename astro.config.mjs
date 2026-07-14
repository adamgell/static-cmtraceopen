import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  output: "static",
  site: "https://cmtraceopen.com",
  build: {
    inlineStylesheets: "never",
  },
  integrations: [
    sitemap({
      filter: (page) => new URL(page).pathname !== "/_download/",
    }),
  ],
  trailingSlash: "always",
});
