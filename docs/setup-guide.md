# TechNoise — Initial Setup Guide

Design plan and end-to-end path from empty folder to a site Google has indexed.
No code in this document. Code starts after the three decisions in Part 0 are locked.

---

## Part 0 — Three decisions to lock before anything is built

### Decision 1: Static site generator

| | Astro | Eleventy (11ty) | Hugo |
|---|---|---|---|
| Language | TS/JS | JS | Go templates |
| Markdown content collections | Built-in, typed | Manual, untyped | Built-in, untyped |
| Sitemap / RSS | Official integrations | Plugins | Built-in |
| JS shipped to visitor | 0 by default | 0 by default | 0 by default |
| Build speed (100 posts) | Seconds | Seconds | Sub-second |
| Adding a React/Vue widget later | Trivial (islands) | Awkward | Awkward |
| Dependency count | Highest of the three | Low | Single binary, zero deps |
| Learning cost if you know JS | Low | Low | Medium (Go templating) |
| Lock-in | Low — content is plain Markdown in all three | Low | Low |

**Recommendation: Astro.** Typed frontmatter catches a malformed post at build time
instead of shipping a broken page, and the islands model means an interactive project
demo later doesn't require rewriting the site. Cost of that choice: the largest
`node_modules` of the three and a major version to upgrade roughly annually.

Pick Hugo instead if you want the site to still build in five years with zero dependency
maintenance and you don't mind Go templates.

### Decision 2: Host

| | Cloudflare Pages | GitHub Pages | Netlify |
|---|---|---|---|
| Price | $0 | $0 | $0 |
| Bandwidth | Unmetered | 100 GB/mo soft cap | 100 GB/mo |
| Builds | 500/month | 10/hour soft cap | 300 build min/mo |
| Site size | 20,000 files, 25 MiB per file | 1 GB recommended | — |
| Repo can be private | Yes | No — free tier is public repos only | Yes |
| Custom domain + SSL | Free | Free | Free |
| Credit card to start | No | No | No |
| Overage behavior | Static assets never bill | Throttling, not a bill | Prompts upgrade |

**Recommendation: Cloudflare Pages.** Unmetered bandwidth removes the one scenario that
makes a free host fail — a post gets traffic and the site goes down or bills you. It also
keeps DNS, registrar, and analytics in one dashboard.

**The one thing to avoid:** anything dynamic on Cloudflare Pages runs as a Function, and
Functions bill against the Workers free plan at 100,000 requests/day with 10 ms CPU per request. A purely static site never touches that. Keep it static
and this stays $0 permanently.

**Actual choice: GitHub Pages.** The repo is public, this site sits comfortably inside the
1 GB/100 GB-per-month limits, and `.github/workflows/deploy.yml` was already the simplest
path from `git push` to a live URL with no separate host to connect. Everything from Phase 5
onward describes GitHub Pages, not Cloudflare Pages — CLAUDE.md's Stack table carries the
current, binding answer.

### Decision 3: Registrar

Buy the domain at Cloudflare Registrar, which passes through the wholesale registry fee plus the $0.18 ICANN fee with no markup and no renewal premium — currently $10.44/yr for a .com. Note for budgeting: Verisign raises the wholesale .com fee on 1 November 2026, taking the at-cost total to about $11.15.

Avoid `.io`, `.ai`, `.tech`, `.dev` unless you want the domain to cost more than everything
else combined — .io runs $50/yr and .ai $80/yr at cost.

Skip this and use `username.github.io` if you want $0.00 total. The tradeoff is that you
can never move the URL without losing accumulated search ranking.

**Actual purchase: `technoise.dev` at Squarespace Domains**, not Cloudflare Registrar. The
registrar doesn't matter to GitHub Pages — only that you can edit its DNS records, which
Phase 5 now assumes is Squarespace's DNS panel rather than Cloudflare's.

---

## Part 1 — Design plan

### Design posture

The brand is already doing the work: a friendly robot, a warm cream field, one loud orange.
The site should be quiet around it. Editorial layout, generous whitespace, one column of
readable text, no cards-in-cards, no gradients, no shadows deeper than a hairline.

Three rules that keep it coherent:

1. **Orange appears once per screen.** It is the "do this" color. A page with three orange
   things has no call to action.
2. **Cream is the page, never white.** Pure white next to `#FDF9F3` reads as a rendering bug.
3. **The mascot is a guest, not wallpaper.** Home hero, About, and 404 only.

### Color roles (derived from the brand tokens, with measured contrast)

| Role | Token | On cream | Notes |
|---|---|---|---|
| Body text | `--ink` `#0C3242` | 12.9:1 | Passes AAA |
| Link text | `--signal-700` `#0A6F94` | 5.4:1 | **Use this, not raw signal** |
| Raw signal `#0C83AE` | — | 4.1:1 | **Fails 4.5:1 — large text, icons, borders only** |
| Orange as text | `--pulse-700` `#B94614` | 5.1:1 | For orange text on cream |
| Raw pulse `#F75E1A` | — | 3.0:1 | Button *fills* and rules only, never text on cream |
| Borders / muted UI | `--slate` `#C2D1D8` | 1.5:1 | Decorative only |

Dark mode (ink becomes the page): lighten to `#6EC9E8` for links (7.2:1 on ink) and
`#FF9F6B` for accents (6.7:1 on ink). Both are tints of the brand bases, not new colors.

This contrast table is the main reason to define the palette now rather than during build —
the raw brand blue is not a legal body-link color, and that's easier to accept on day one
than after fifty posts use it.

### Type and rhythm

- **Two families, no more.** One grotesk/humanist sans for everything, one mono for code. The
  wordmark itself is no longer live text — it shipped as artwork inside the brand SVGs
  (`public/brand/`) once the header and footer took the traced logo, so it doesn't draw from
  the body typeface at all. See AGENTS.md's posture-rule carve-outs for why the mascot and
  wordmark are now global brand chrome rather than confined to hero/About/404.
- **Body: 18px on mobile, 19–20px on desktop.** Measure capped at 68–72 characters.
  Line height 1.65 for body, 1.2 for headings.
- **Scale (1.25 ratio):** 14 / 16 / 18 / 20 / 25 / 31 / 39 / 49 px. Nothing outside it.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px. Nothing outside it.
- **Grid:** single 720px content column, widening to 1100px only for project card grids and
  the footer. Gutters 24px mobile, 48px desktop.

### Component inventory (build these once, reuse everywhere)

Header · Footer · PostCard · ProjectCard · TagPill · Prose block (typographic styles for
Markdown output) · CodeBlock with copy button · Callout · Pagination · Breadcrumb ·
ThemeToggle (optional) · SEO head block · OG image template.

That's the whole list. If a page needs a thirteenth component, question the page.

### Page layouts

**Home** — the only page allowed to be dense.
```
Header
Hero: mascot illustration left, "Name — what you build" right,
      one sentence of positioning, two buttons (Read the blog / See projects)
Latest posts: 3 PostCards, "All posts →"
Featured projects: 2–3 ProjectCards, "All projects →"
Short about strip + links to resume and contact
Footer
```

**Blog index** — title, one-line description, tag filter row, PostCards in a single column
(date, title, description, tags, read time), pagination at 10 per page.

**Post** — breadcrumb, H1, date and updated date, tags, optional hero image, prose column,
table of contents on desktop only if the post exceeds ~1500 words, prev/next links at the
bottom. No share buttons, no comments, no newsletter modal.

**Projects index** — two-column card grid on desktop, one on mobile. Each card: name, stack
badges, one-line pitch, screenshot thumbnail.

**Project detail** — the format that actually gets read:
```
H1 + one-line pitch
Live demo button (pulse) + source link (ghost)
Problem  → Approach  → Stack  → What was hard  → What I'd do differently
Screenshots
```

**Resume** — done. Web-native only, no "Download PDF" button and no committed
`resume.pdf`: a route-scoped print stylesheet (`src/styles/print.css`) makes Ctrl+P produce
the clean document instead, so there is no separate asset that can drift from the page.
Sections shipped: summary, experience, skills, education (no separate Projects section — the
page points to `/projects/` instead of repeating it). No phone number or city/state anywhere
on the page, in its structured data, or in its metadata — a hard constraint, not an omission.

**About** — bio, mascot illustration, contact, elsewhere links.

**404** — mascot illustration, "This page isn't in the feed," links to home and blog.

### Asset prep from your five files

| Output | Source file | Notes |
|---|---|---|
| `favicon.ico` 32px + 16px | `TechNoise_Minified_Icon.png` | Detail is already reduced for small sizes |
| `icon-192`, `icon-512` | `archive/brand-pre-svg-migration/technoise-large-icon.png` | PWA manifest and Android |
| `apple-touch-icon` 180px | `archive/brand-pre-svg-migration/technoise-large-icon.png` | Needs an opaque cream background, no transparency |
| Header logo — **done** | `TechNoise_Full_Logo.PNG` | Traced to SVG (`public/brand/technoise-logo-full.svg` and `-presentation.svg`); used in both `Header.astro` and `Footer.astro`, swapped by breakpoint |
| Social profile images | `archive/brand-pre-svg-migration/technoise-presentation-logo.png` | GitHub, LinkedIn, X |
| Default OG image 1200×630 | `TechNoise_Full_Logo.PNG` | Cream field, logo left, page title right |
| Hero / About / 404 art | `TechNoise_Background.png` | Export at 2x width used, AVIF + WebP |

The full logo and icon are now traced to SVG (`public/brand/`, plus `favicon.svg`/`.ico`) — the
one-time job the original flag below asked for is done. Still raster and still pending:
`icon-192`, `icon-512`, `apple-touch-icon`, and the PWA manifest that would reference them —
out of scope for the header/footer branding pass that shipped the logo trace. Their source
canvases moved in Issue #32 from `public/brand/` to `archive/brand-pre-svg-migration/`
(versioned but never built or served, since Astro copies `public/` verbatim into `dist/`) — see
that directory's `README.md` for the full file-to-file mapping.

### Repo layout

```
technoise/
├─ src/
│  ├─ assets/            astro:assets input — processed and hashed at build, unlike public/
│  ├─ content.config.ts  collection schemas (Astro 7 path — outside src/content/)
│  ├─ content/
│  │  ├─ blog/           one Markdown file per post
│  │  └─ projects/       one Markdown file per project
│  ├─ components/
│  ├─ layouts/
│  ├─ lib/               shared TypeScript helpers (publishing rules, formatting, SEO)
│  ├─ pages/             routes, plus generated non-HTML endpoints: sitemap.xml.ts,
│  │                     rss.xml.ts, robots.txt.ts (see Phase 4 — not static files in
│  │                     public/, because the sitemap URL has to be absolute and a
│  │                     literal hostname there would go stale the moment one is chosen)
│  └─ styles/
├─ public/
│  ├─ brand/             the three live logo SVGs, committed
│  └─ favicon files
│     (no resume.pdf — the print stylesheet is the PDF; see Part 1's Resume layout)
├─ .github/workflows/
├─ .nvmrc
├─ README.md
└─ lockfile
```

---

## Part 2 — Local to indexed, in phases

Each phase ends in something verifiable. Don't start the next one until the current one is
actually done.

### Phase 1 — Repo and local build (1 evening) — done
1. Create the GitHub repo. Public unless you have a reason otherwise.
2. Scaffold the generator, pin the Node version in `.nvmrc`, commit the lockfile.
3. Confirm the dev server runs and the production build produces a static output folder.
4. First commit.

**Done when:** `git clone` on a different machine, install, build, and it works.

### Phase 2 — Design system (1–2 evenings) — done
1. Encode the color tokens, type scale, and spacing scale as CSS custom properties.
2. Build the header, footer, and prose styles.
3. Wire dark mode off `prefers-color-scheme` using the tinted tokens.

**Done when:** one dummy page looks right at 320px, 768px, 1440px, in both color schemes.

### Phase 3 — Content pipeline (1–2 evenings) — done
1. Define typed frontmatter schemas for posts and projects, in `src/content.config.ts` using
   the `glob()` loader from `astro/loaders`. That path matters: Astro 7 throws
   `LegacyContentConfigError` on the pre-7 `src/content/config.ts` location.
2. Build the blog index, post page, tag archives, project index, project detail.
3. Write two real posts and one real project entry. Two is the minimum that reveals layout
   bugs a single sample hides.

**Done when:** adding a Markdown file to `src/content/blog/` makes a live page with no other
edits. Verified.

### Phase 4 — SEO scaffolding (1 evening) — done
1. Per-page title, description, canonical URL, Open Graph, Twitter card.
2. Hand-rolled `sitemap.xml` and `rss.xml` endpoints at build, built on the existing
   publishing rules in `src/lib/content.ts` rather than the official integrations — see
   `src/lib/seo.ts` and the endpoint files for the reasoning (an integration can't know
   this repo's own `noindex` rules, and `@astrojs/sitemap` doesn't emit `/sitemap.xml`).
3. `robots.txt` generated at `src/pages/robots.txt.ts`, not a static file in `public/` —
   it needs an absolute sitemap URL and the hostname isn't settled (Part 0 Decision 3).
4. JSON-LD: `WebSite` + `Person` on home, `BlogPosting` on posts, `CreativeWork` on
   projects, `BreadcrumbList` on posts, projects and tag archives. `Person` on About is
   deferred until that page exists (Part 5) — it's a two-line addition when it's built.
5. One static OG image fallback (`public/og/technoise-og.png`), not per-page generation —
   three content entries didn't justify a renderer dependency.

**Done when:** view-source on three different page types shows three different titles,
descriptions, and canonicals — no duplicates. Verified.

### Phase 5 — Deploy (1 evening) — done, on GitHub Pages, not Cloudflare Pages
1. Push to `master`. `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on
   every push — there is no separate host to connect.
2. First deploy lands on `https://<user>.github.io/<repo>/`, a *subpath* URL that
   `assertRootDeploy()` (`src/lib/seo.ts`) rejects as the final `site`. Verify the build
   there, then leave `site` in `astro.config.mjs` pointed at the custom domain, never the
   `.github.io` one.
3. Buy the domain and be able to edit its DNS (Decision 3 — this site's came from Squarespace
   Domains).
4. Repo Settings → Pages → **Custom domain** → enter the apex (`technoise.dev`) → GitHub
   shows the DNS values to add and enters a "DNS check in progress" state that clears on its
   own once the records below resolve. There's nothing to click to speed that up.
5. At the registrar's DNS panel (Squarespace's, here), point the apex at GitHub Pages:
   - Four `A` records at the apex (`@`) → `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`.
   - Four `AAAA` records at the apex → `2606:50c0:8000::153`, `2606:50c0:8001::153`,
     `2606:50c0:8002::153`, `2606:50c0:8003::153`.
   - One `CNAME` record for the `www` host → `<github-username>.github.io.`
6. **Choose apex or `www` as canonical and let GitHub redirect the other.** The committed
   `public/CNAME` file names the canonical host (GitHub reads this on every Actions-based
   deploy — it doesn't write the file for you the way "Deploy from a branch" would); GitHub
   redirects the other host to it once both resolve. Pick once — changing it later splits
   search ranking across two hostnames.
7. Optional but recommended: account Settings → Pages → **Verified domains** → add the domain
   → add the `_github-pages-challenge-<user>` TXT record it gives you at the registrar →
   verify. This blocks anyone else from ever pointing a Pages site at your domain during a
   moment the DNS record dangles.
8. Once DNS resolves, confirm **Enforce HTTPS** is checked in the Pages settings, and that
   the `.github.io` URL still resolves (GitHub won't deindex it, but nothing links to it and
   the custom domain's own canonical/`noindex` tags keep it out of search results).

**Done when:** the custom domain serves over HTTPS, a plain `git push` alone republishes it,
and every internal link uses the custom domain.

### Phase 6 — Indexing (30 minutes, then waiting)
1. **Google Search Console** → add property → **Domain** property (not URL prefix) → it
   gives you a TXT record → add it at your registrar's DNS (Squarespace here) → verify.
   Domain properties cover every subdomain and both protocols, which saves grief later.
2. Submit `https://yourdomain/sitemap.xml` under Sitemaps. Confirm it reports "Success" and a
   page count matching reality.
3. URL Inspection → Request Indexing for home, `/blog/`, `/projects/`, `/resume/`, `/about/`.
4. **Bing Webmaster Tools** → add site → import from Search Console. Two minutes, covers Bing
   and every engine downstream of it.
5. Run Lighthouse on mobile. Target Performance ≥ 90, Accessibility ≥ 95, SEO = 100.
6. Add Cloudflare Web Analytics — free, no cookie banner required, no visitor data sold.

**Done when:** Search Console shows the sitemap read successfully and at least the homepage
indexed.

**Realistic expectation:** a brand new domain with no inbound links typically takes days to
a few weeks for first indexing, and longer to rank for anything. Nobody can shorten this and
anyone who says otherwise is selling something. Publishing consistently and getting a handful
of real inbound links (GitHub profile, LinkedIn, dev.to crossposts, HN or Reddit comments
where genuinely relevant) does more than any technical tweak at this stage.

### Phase 7 — Per-post routine (5 minutes)
Write Markdown → push → Cloudflare rebuilds → confirm the URL appears in `sitemap.xml` →
Request Indexing in Search Console.

### Phase 8 — Monthly (15 minutes)
Search Console coverage report → fix errors. Check for dependency security advisories.
Confirm the build still passes. Once a year: renew the domain, upgrade the major version.

---

## Part 3 — Cost ledger

```
domain (.com, at cost)     $10.44/yr  → ~$11.15/yr after 1 Nov 2026
hosting (Cloudflare Pages) $0
DNS + SSL                  $0
analytics                  $0
Search Console / Bing      $0
GitHub (public repo)       $0
────────────────────────────────────
TOTAL                      ~$10–11/yr
```

Things that would break this, so decide against them deliberately: a hosted CMS, a comment
system with a backend, a newsletter provider past its free tier, a contact form that needs a
server, an image CDN, or any serverless function taking real traffic.

Free substitutes for each: Markdown in the repo; giscus (GitHub Discussions-backed comments);
Buttondown or similar free tier under 100 subscribers; a `mailto:` link or a free Formspree
tier; build-time image optimization; nothing.

---

## Part 4 — Launch checklist

- [x] Every page has a unique title (≤60 chars) and description (≤155 chars)
- [x] Canonical URLs are absolute and use the chosen hostname — `https://technoise.dev` in
      `astro.config.mjs` is confirmed as the GitHub Pages custom domain (Phase 5); DNS
      propagation to it was still finishing as of this check.
- [ ] OG image renders correctly in a social preview debugger — image is built and
      committed (1200×630, cream field, no crop); not run against a debugger, which needs
      a publicly reachable URL and the site isn't deployed yet
- [x] `sitemap.xml` lists every public page and no drafts
- [x] `robots.txt` allows crawling and references the sitemap
- [ ] RSS validates — parses under a real XML parser with the required channel elements,
      `xmlns:atom` and `atom:link rel="self"`; the W3C Feed Validation Service itself
      wasn't reachable in this environment to run the last mile of this check
- [ ] Apex/`www` decision made, other one 301s
- [ ] HTTPS enforced
- [ ] 404 page works on the live host, not just locally
- [ ] Lighthouse mobile: Perf ≥ 90, A11y ≥ 95, SEO = 100
- [ ] Keyboard-only navigation works, focus states visible
- [ ] Works at 320px and in dark mode
- [ ] Search Console verified, sitemap submitted, key pages requested
- [ ] Bing verified
- [x] Resume prints a clean document via the route-scoped print stylesheet — no separate
      PDF asset exists to drift from the web version (decided against; see Part 1's Resume
      layout)
- [ ] README has the build, dev, and deploy commands

---

## Part 5 — What's needed from you before Phase 3

The site can be built without these, but it can't be filled:

- Resume source material — roles, dates, responsibilities, measurable outcomes —
  **supplied and shipped**; `/resume/` is real content, not a scaffold, with the owner's
  phone number and location deliberately withheld per their own instruction
- Project list — name, one-line pitch, stack, demo URL, repo URL, screenshots
- 2–3 blog post topics with your rough notes
- Positioning sentence for the home hero: what you build and who it's for
- Preferred domain name, and a backup
- Contact preference: email, form, or social only
- Whether the repo is public or private (it decides GitHub Pages eligibility, not Cloudflare)

Project details, work history, and opinions won't be invented — bring notes and they'll get
shaped into the site's voice.
