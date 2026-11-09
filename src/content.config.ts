// Astro 7 reads collection config from src/content.config.ts. The legacy
// src/content/config.ts path throws LegacyContentConfigError unless legacy
// collections are re-enabled, so docs/setup-guide.md's Phase 3 path is stale.
//
// zod here is v4: z.url() and z.coerce.date(), not the v3 z.string().url().

import { defineCollection, type SchemaContext } from "astro:content";
import { glob } from "astro/loaders";
// `z` re-exported from astro:content is deprecated for removal in Astro 8 and
// astro check reports it. astro/zod is the stable re-export of the same zod v4.
import { z } from "astro/zod";

// Stored in slug form and displayed as stored. Normalising at render time instead
// would let "Astro" and "astro" open two archives for one idea.
const tag = z
  .string()
  .min(1)
  .max(24, {
    error: 'Tags are capped at 24 characters so "Posts tagged <tag> — TechNoise" stays within the 60-character <title> budget.',
  })
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    error: 'Tags are lowercase and hyphenated, e.g. "design-systems".',
  });

// 48 + " — TechNoise" (12) = the 60-character <title> budget in AGENTS.md, exactly.
const title = z
  .string()
  .min(1)
  .max(48, {
    error: 'Titles are capped at 48 characters: every page renders "<title> — TechNoise", and the suffix costs 12 of the 60-character budget.',
  });

// One field, not a separate card pitch: at 155 characters the card summary, the
// detail-page lede and the meta description are the same sentence.
const description = z
  .string()
  .min(1)
  .max(155, {
    error: "Descriptions are capped at 155 characters — they ship as the meta description.",
  });

// Optional per-entry link-preview image. `alt` is optional too: when set it ships as
// og:image:alt and twitter:image:alt, must not be blank, and 420 is X's cap; when
// omitted neither tag ships. The size and ratio rule cannot live here: under the
// glob loader image() yields an unresolved import, not dimensions, so
// src/lib/og-image.ts enforces it when the page renders. EXIF is not checked at
// build either — tests/nav-contract.test.ts scans src/assets.
const ogImage = (image: SchemaContext["image"]) =>
  z
    .object({
      src: image(),
      alt: z
        .string()
        .trim()
        .min(1)
        .max(420, { error: "ogImage alt is capped at 420 characters (X's limit)." })
        .optional(),
    })
    .optional();

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
  schema: ({ image }) =>
    z
      .object({
        title,
        description,
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        tags: z.array(tag).min(1).max(3, { error: "A post carries at most 3 tags." }),
        draft: z.boolean().default(false),
        ogImage: ogImage(image),
      })
      .refine((data) => !data.updatedDate || data.updatedDate >= data.pubDate, {
        error: "updatedDate cannot be earlier than pubDate.",
      }),
});

const projects = defineCollection({
  loader: glob({ base: "./src/content/projects", pattern: "**/*.md" }),
  schema: ({ image }) =>
    z.object({
      title,
      description,
      stack: z.array(z.string().min(1)).min(1).max(6),
      status: z.enum(["in-progress", "shipped", "archived"]).default("in-progress"),
      startDate: z.coerce.date(),
      demoUrl: z.url().optional(),
      repoUrl: z.url().optional(),
      draft: z.boolean().default(false),
      ogImage: ogImage(image),
    }),
});

export const collections = { blog, projects };
