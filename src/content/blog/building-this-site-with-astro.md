---
title: "Building this site with Astro"
description: "Why this site is a static Astro build that ships no client JavaScript, and what its first three phases actually produced."
pubDate: 2026-09-15
tags: [astro, meta]
draft: false
---

Three generators were on the table for this site: Astro, Eleventy and Hugo. All three
ship zero JavaScript to the visitor by default, all three keep the content as plain
Markdown, and all three build a hundred posts in about as long as it takes to notice.
The decision came down to what happens when a post is wrong.

## Why Astro, not Eleventy or Hugo

Astro has typed content collections built in. Eleventy's Markdown frontmatter is
untyped, and Hugo's is untyped too. The setup guide for this project put the argument
in one line:

> Typed frontmatter catches a malformed post at build time instead of shipping a
> broken page.

The second reason is optionality. Nothing on this site is interactive today, but an
island — a small interactive component, hydrated on its own — is a normal thing to add
to an Astro page later and an awkward thing to add to the other two.

Neither reason is free. The costs, written down at the time rather than discovered
later:

- The largest `node_modules` of the three. Hugo is a single binary with no
  dependencies at all.
- A major version to upgrade roughly annually. This repo is on Astro 7, and Astro 7
  already moved the content collection config out of `src/content/config.ts` — the old
  path now throws at build.
- Go templates would have been the cheaper long-term bet if the site needed to still
  build in five years untouched. That is a real tradeoff, not a strawman; Hugo is the
  right answer to a slightly different question.

## What zero JavaScript buys

The header is four links and a wordmark. There is no hamburger, no disclosure widget
and no menu state, because at 320px the four links fit on their own row underneath the
brand. Nothing on the site hydrates, so there is no bundle to split, no flash of
unstyled state, and no interaction that breaks when a script fails to load.

The dark scheme works the same way. It is not a second stylesheet and not a toggle: the
semantic tokens re-bind under `prefers-color-scheme: dark`, and every component that
only ever names a token follows along for free.

## The design system came before the content

Phase 2 encoded the whole visual system before a single post existed: seven brand
colours, an eight-step type scale, a nine-step spacing scale, and exactly one
breakpoint, declared in `em` so it answers to the reader's default font size rather
than to the root element. An off-scale value is hard to write by accident, because
writing one means inventing a token name that does not exist.

Doing it in that order has a cost, covered in the project entry for this site: the
sample posts could have driven the typography instead of being poured into it.

## Typed frontmatter in practice

The blog schema is about twenty lines, and every constraint in it is a rule that would
otherwise live in someone's memory:

```ts
const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
  schema: z.object({
    title,
    description,
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(tag).min(1).max(4),
    draft: z.boolean().default(false),
  }),
});
```

The title cap is 48 characters, because every page renders its title as
`<title> — TechNoise` and the suffix costs twelve of the sixty characters a title is
allowed. The tag pattern is lowercase and hyphenated, so `Astro` and `astro` cannot
open two archives for the same idea. Delete the description from this post and the
build fails with the field name and the file path, which is the entire point: the
failure happens on a machine, before the page exists, rather than in front of a reader.

## What is not done yet

This is the end of the third phase, not the end of the work. There is no SEO head
block yet — no canonical URL, no Open Graph tags, no JSON-LD. There is no sitemap and
no RSS feed. The site has not been deployed anywhere, has not been submitted to any
search engine, and has never been visited by anyone who did not clone the repository.
Those are phases four through six, and claiming any of them now would be the kind of
thing this site is trying not to do.
