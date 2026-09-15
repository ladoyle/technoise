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

### Decision 3: Registrar

Buy the domain at Cloudflare Registrar, which passes through the wholesale registry fee plus the $0.18 ICANN fee with no markup and no renewal premium — currently $10.44/yr for a .com. Note for budgeting: Verisign raises the wholesale .com fee on 1 November 2026, taking the at-cost total to about $11.15.

Avoid `.io`, `.ai`, `.tech`, `.dev` unless you want the domain to cost more than everything
else combined — .io runs $50/yr and .ai $80/yr at cost.

Skip this and use `username.github.io` if you want $0.00 total. The tradeoff is that you
can never move the URL without losing accumulated search ranking.

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
| Raw pulse `#F75E1A` | — | 3.1:1 | Button *fills* and rules only, never text on cream |
| Borders / muted UI | `--slate` `#C2D1D8` | 1.5:1 | Decorative only |

Dark mode (ink becomes the page): lighten to `#6EC9E8` for links (7.2:1 on ink) and
`#FF9F6B` for accents (6.7:1 on ink). Both are tints of the brand bases, not new colors.

This contrast table is the main reason to define the palette now rather than during build —
the raw brand blue is not a legal body-link color, and that's easier to accept on day one
than after fifty posts use it.

### Type and rhythm

- **Two families, no more.** One grotesk/humanist sans for everything (the wordmark reads
  as Inter or Work Sans), one mono for code.
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

**Resume** — web-native first, PDF second. Sticky "Download PDF" button. Sections: summary,
experience, projects, skills, education. A print stylesheet makes Ctrl+P produce a clean
document, which means the PDF and the page can never drift apart.

**About** — bio, mascot illustration, contact, elsewhere links.

**404** — mascot illustration, "This page isn't in the feed," links to home and blog.

### Asset prep from your five files

| Output | Source file | Notes |
|---|---|---|
| `favicon.ico` 32px + 16px | `TechNoise_Minified_Icon.png` | Detail is already reduced for small sizes |
| `icon-192`, `icon-512` | `TechNoise_Large_Icon.png` | PWA manifest and Android |
| `apple-touch-icon` 180px | `TechNoise_Large_Icon.png` | Needs an opaque cream background, no transparency |
| Header logo | `TechNoise_Full_Logo.PNG` | Trace to SVG — a PNG wordmark will look soft on retina |
| Social profile images | `TechNoise_Presentation_Logo.png` | GitHub, LinkedIn, X |
| Default OG image 1200×630 | `TechNoise_Full_Logo.PNG` | Cream field, logo left, page title right |
| Hero / About / 404 art | `TechNoise_Background.png` | Export at 2x width used, AVIF + WebP |

One flag: all five assets are raster. Converting the full logo and icon to SVG is a small
one-time job that pays off in sharpness, dark-mode recoloring, and file size. Worth doing
before the header is built, not after.

### Repo layout

```
technoise/
├─ src/
│  ├─ content/
│  │  ├─ blog/           one Markdown file per post
│  │  └─ projects/       one Markdown file per project
│  ├─ components/
│  ├─ layouts/
│  ├─ pages/
│  └─ styles/
├─ public/
│  ├─ brand/             logo source files, committed
│  ├─ favicon files
│  ├─ resume.pdf
│  └─ robots.txt
├─ .github/workflows/
├─ .nvmrc
├─ README.md
└─ lockfile
```

---

## Part 2 — Local to indexed, in phases

Each phase ends in something verifiable. Don't start the next one until the current one is
actually done.

### Phase 1 — Repo and local build (1 evening)
1. Create the GitHub repo. Public unless you have a reason otherwise.
2. Scaffold the generator, pin the Node version in `.nvmrc`, commit the lockfile.
3. Confirm the dev server runs and the production build produces a static output folder.
4. First commit.

**Done when:** `git clone` on a different machine, install, build, and it works.

### Phase 2 — Design system (1–2 evenings)
1. Encode the color tokens, type scale, and spacing scale as CSS custom properties.
2. Build the header, footer, and prose styles.
3. Wire dark mode off `prefers-color-scheme` using the tinted tokens.

**Done when:** one dummy page looks right at 320px, 768px, 1440px, in both color schemes.

### Phase 3 — Content pipeline (1–2 evenings)
1. Define typed frontmatter schemas for posts and projects.
2. Build the blog index, post page, tag archives, project index, project detail.
3. Write two real posts and one real project entry. Two is the minimum that reveals layout
   bugs a single sample hides.

**Done when:** adding a Markdown file to `src/content/blog/` makes a live page with no other
edits.

### Phase 4 — SEO scaffolding (1 evening)
1. Per-page title, description, canonical URL, Open Graph, Twitter card.
2. Auto-generated `sitemap.xml` and `rss.xml` at build.
3. `robots.txt` allowing crawl and pointing at the sitemap.
4. JSON-LD: `Person` on home and about, `BlogPosting` on posts, `CreativeWork` on projects,
   `BreadcrumbList` where nesting exists.
5. Generated OG images, or one good static fallback.

**Done when:** view-source on three different page types shows three different titles,
descriptions, and canonicals — no duplicates.

### Phase 5 — Deploy (1 evening)
1. Push to GitHub.
2. In Cloudflare Pages, connect the repo, set the build command and output directory.
3. First deploy lands on a `*.pages.dev` URL. Verify it there before touching DNS.
4. Buy the domain at Cloudflare Registrar.
5. Attach the custom domain in Pages. DNS and SSL are automatic when the domain is in the
   same Cloudflare account.
6. **Choose apex or `www` and 301 the other.** Pick one now; changing it later splits your
   search ranking across two hostnames.
7. Confirm HTTPS is enforced and the `.pages.dev` URL isn't independently indexable.

**Done when:** the custom domain serves over HTTPS and every internal link uses it.

### Phase 6 — Indexing (30 minutes, then waiting)
1. **Google Search Console** → add property → **Domain** property (not URL prefix) → it
   gives you a TXT record → add it in Cloudflare DNS → verify. Domain properties cover every
   subdomain and both protocols, which saves grief later.
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

- [ ] Every page has a unique title (≤60 chars) and description (≤155 chars)
- [ ] Canonical URLs are absolute and use the chosen hostname
- [ ] OG image renders correctly in a social preview debugger
- [ ] `sitemap.xml` lists every public page and no drafts
- [ ] `robots.txt` allows crawling and references the sitemap
- [ ] RSS validates
- [ ] Apex/`www` decision made, other one 301s
- [ ] HTTPS enforced
- [ ] 404 page works on the live host, not just locally
- [ ] Lighthouse mobile: Perf ≥ 90, A11y ≥ 95, SEO = 100
- [ ] Keyboard-only navigation works, focus states visible
- [ ] Works at 320px and in dark mode
- [ ] Search Console verified, sitemap submitted, key pages requested
- [ ] Bing verified
- [ ] Resume PDF downloads and matches the web version
- [ ] README has the build, dev, and deploy commands

---

## Part 5 — What's needed from you before Phase 3

The site can be built without these, but it can't be filled:

- Resume source material — roles, dates, responsibilities, measurable outcomes
- Project list — name, one-line pitch, stack, demo URL, repo URL, screenshots
- 2–3 blog post topics with your rough notes
- Positioning sentence for the home hero: what you build and who it's for
- Preferred domain name, and a backup
- Contact preference: email, form, or social only
- Whether the repo is public or private (it decides GitHub Pages eligibility, not Cloudflare)

Project details, work history, and opinions won't be invented — bring notes and they'll get
shaped into the site's voice.
