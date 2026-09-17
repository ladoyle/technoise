# TechNoise

A personal blog and portfolio site, built on [Astro](https://astro.build) as a static site
that ships zero client JavaScript by default, with one justified exception: the header's
mobile nav disclosure. Content is Markdown with typed frontmatter; the build fails rather
than publish a malformed entry.

The full design plan and phase roadmap lives in [`docs/setup-guide.md`](docs/setup-guide.md).
The binding stack, layout and design-standards contract lives in [`AGENTS.md`](AGENTS.md).

## Current state

Blog and project routes are live: listing, post, tag archives, projects index, project
detail (`docs/setup-guide.md` Phase 3). Every page now carries a canonical URL, Open Graph
and Twitter card tags, and a JSON-LD graph; `/sitemap.xml`, `/rss.xml` and `/robots.txt` are
generated at build, and shared links render a committed 1200×630 OG card instead of a grey
placeholder (`docs/setup-guide.md` Phase 4). The home page is a real front door — mascot
hero, one heading, one lede, three calls to action, latest posts and projects — with a
primary nav that collapses behind a labelled toggle below 768px. `/resume/` is real content —
summary, experience, skills and education, indexable and in the sitemap — with the owner's
phone number and location deliberately excluded from the page, its structured data, and its
metadata (see `AGENTS.md`'s note on `src/lib/resume.ts`). A 404 page is live, reusing the
home hero's mascot art, `noindex`ed and excluded from the sitemap since a static host can't
pair it with a real 404 status. About is not built yet — it needs positioning copy that only
the site owner can supply (see `docs/setup-guide.md` Part 5).

## Running locally

```sh
npm install          # install dependencies
npm run dev          # dev server on localhost:4321
npm run build        # production build to ./dist/
npm run preview      # serve the built output
npx astro check      # type and template diagnostics
npm test             # vitest run — schema, publishing-rule, build-output, SEO-helper,
                      # discovery-output (sitemap/rss/robots) and nav/route-resolution tests
```

Node `>=22.12.0` is required, pinned in `.nvmrc`.

If a content file was deleted or renamed and a rebuild still shows it, clear Astro's content
cache: `rm -rf node_modules/.astro`. It lives there, not in `.astro/`, so a plain
`rm -rf .astro dist` will not pick up the change.

## Adding content

Drop a Markdown file into `src/content/blog/` or `src/content/projects/` and it produces a
live page, a listing entry, and (for posts) a tag archive — no other edits. The schema in
`src/content.config.ts` enforces the frontmatter shape at build time; a bad entry fails the
build with the field and the reason.

**Blog post** (`src/content/blog/<slug>.md`):

```yaml
---
title: string, 1–48 characters
description: string, 1–155 characters
pubDate: 2026-01-01
updatedDate: 2026-01-15 # optional, must not be earlier than pubDate
tags: [design-systems, astro] # 1–4 tags, lowercase-hyphenated, ≤24 characters each
draft: false # optional, defaults to false
---
```

**Project** (`src/content/projects/<slug>.md`):

```yaml
---
title: string, 1–48 characters
description: string, 1–155 characters
stack: [Astro, TypeScript] # 1–6 entries
status: in-progress | shipped | archived # defaults to in-progress
startDate: 2026-01-01
demoUrl: https://example.com # optional
repoUrl: https://example.com # optional
draft: false # optional, defaults to false
---
```

Rules worth knowing before writing:

- Content files sit directly in `src/content/blog/` or `src/content/projects/`, never in a
  subdirectory. A filename becomes one URL segment, so `blog/2026/a-post.md` has nowhere to
  live; the build fails naming the file.
- A post's filename becomes its URL slug and may not be a bare number — it collides with the
  `/blog/<n>/` pagination routes and fails the build.
- `draft: true` hides an entry from production builds only; `astro dev` still shows it.
- Markdown renders raw HTML as-is, so a content file is as privileged as a component. Only
  repo-authored, reviewed Markdown goes in `src/content/`.

See [`AGENTS.md`](AGENTS.md) for the full content-authoring contract.

## Deploying

GitHub Pages, via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), on every
push to `master`. No manual build step — the workflow installs, builds, and publishes.

Only a root deploy is supported: `site` in `astro.config.mjs` must be an origin with no
path, and Astro's `base` must stay unset or `/`. The build fails explicitly if either is
set to a project subpath — see `AGENTS.md`'s "Page SEO" section.
