import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const fieldGuide = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/field-guide" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    keywords: z.array(z.string()).default([]),
  }),
});

export const collections = { fieldGuide };
