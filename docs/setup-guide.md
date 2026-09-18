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

| | GitHub Pages | Cloudflare Pages | Netlify |
|---|---|---|---|
| Price | $0 | $0 | $0 |
| Bandwidth | 100 GB/mo soft cap | Unmetered | 100 GB/mo |
| Builds | 10/hour soft cap | 500/month | 300 build min/mo |
| Site size | 1 GB recommended | 20,000 files, 25 MiB per file | — |
| Repo can be private | No — free tier is public repos only | Yes | Yes |
| Custom domain + SSL | Free (GitHub-provisioned Let's Encrypt) | Free | Free |
| Build runs in | A workflow in this repo | Vendor build image, dashboard-configured | Vendor build image |
| Credit card to start | No | No | No |
| Overage behavior | Throttling, not a bill | Static assets never bill | Prompts upgrade |

**Recommendation: GitHub Pages.** Two costs come with it and both are accepted knowingly.
First, the repo must be public — the free tier serves public repos only, which is already a
stated requirement elsewhere in this guide. Second, bandwidth is a 100 GB/mo soft cap rather
than unmetered; for a text-and-SVG site with one committed OG image that is not a real
constraint, and the documented failure mode is throttling, never a bill.

What actually motivated the choice is where the build runs: a workflow this repository owns,
not a vendor build image configured through a dashboard. That is what makes the deploy's
permissions scopeable per job and its third-party actions pinnable to full commit SHAs — the
two `deploy.yml` conventions AGENTS.md makes binding. A dashboard-configured build cannot be
reviewed in a pull request; this one can. The implementation is
`.github/workflows/deploy.yml`, which runs on every push to `master` and on manual
`workflow_dispatch`.

**The one thing to avoid:** GitHub Pages serves static files and nothing else — no
server-side execution, no redirect rules, no custom response headers, no environment-based
configuration. Anything dynamic means leaving this host, not paying for an add-on on it. The
one redirect the host does perform for you: with the custom domain set and both hostnames'
DNS pointing at Pages, GitHub redirects between the apex and `www` itself, which is how the
apex-or-`www` decision in Phase 5 gets enforced without a redirect rule to write. Keep the
site static and this stays $0 permanently.

### Decision 3: Registrar and DNS

The host is GitHub Pages (Decision 2), and that settles nothing about who sells the domain or
whose nameservers answer for it. A Pages custom domain is wired entirely with ordinary DNS
records plus one setting in the repo, so the registrar and the authoritative DNS provider can
be anyone — Cloudflare included. Keeping the domain and the zone at Cloudflare while GitHub
serves the origin is a normal, supported arrangement, not a compromise.

Buy the domain at Cloudflare Registrar, which passes through the wholesale registry fee plus the $0.18 ICANN fee with no markup and no renewal premium — currently $10.44/yr for a .com. Note for budgeting: Verisign raises the wholesale .com fee on 1 November 2026, taking the at-cost total to about $11.15.

Avoid `.io`, `.ai`, `.tech`, `.dev` unless you want the domain to cost more than everything
else combined — .io runs $50/yr and .ai $80/yr at cost.

That advice is currently being overridden: `astro.config.mjs` already sets
`site: 'https://technoise.dev'`, a `.dev` — one of the TLDs the paragraph above warns about.
Either the override is deliberate or the hostname needs revisiting, and that is a human
decision, not something this guide settles. Before treating Part 3's ledger total as
accurate, check the registrar's current at-cost renewal price for `.dev` and reconcile it
with the `.com` figure that ledger line is built on. One hard consequence comes with the
choice either way: the whole `.dev` TLD is on the HSTS preload list, so browsers refuse plain
HTTP for it unconditionally — the site is HTTPS-only from the very first request, with no
HTTP fallback while a certificate provisions.

**Wiring the custom domain to GitHub Pages** takes three things, all of them independent of
who the registrar is:

1. A `CNAME` file in `public/`, containing the bare custom domain on one line and nothing
   else — no scheme, no trailing slash, no second hostname. Astro copies `public/` verbatim
   into the build output, so the file lands at the root of what gets published.
2. The DNS records below, created at whatever provider holds the zone.
3. The same domain entered in the repo's Settings → Pages → Custom domain. Add the file *and*
   set the field — not one or the other — so the configuration survives regardless of which
   one the platform treats as authoritative.

```
Apex (technoise.dev)      A     185.199.108.153
                          A     185.199.109.153
                          A     185.199.110.153
                          A     185.199.111.153
                          AAAA  2606:50c0:8000::153
                          AAAA  2606:50c0:8001::153
                          AAAA  2606:50c0:8002::153
                          AAAA  2606:50c0:8003::153
www.technoise.dev         CNAME ladoyle.github.io.
```

These are GitHub's documented addresses, but GitHub has changed them historically — re-check
the list against GitHub's own Pages custom-domain documentation before creating the records,
and use what that page says if it disagrees with this block.

If the zone lives at Cloudflare, every one of these records must be **DNS-only (grey cloud),
not proxied (orange cloud)**. This is the single most likely way a correct-looking setup
fails: a proxied record intercepts the HTTP-01 challenge GitHub uses to issue the
certificate, so issuance never completes, and a proxied record combined with Cloudflare's
"Flexible" SSL mode produces a redirect loop against a host that already redirects to HTTPS.
If a CAA record exists on the zone, it must permit `letsencrypt.org`.

Skip the domain entirely and you can have $0.00 total, but the free path has a specific
shape: it must be a **user page** — a repo named `<username>.github.io`, served at
`https://<username>.github.io/` — not the project URL this repo gets by default,
`https://<username>.github.io/technoise/`. The reason is that this site supports a root
deploy only. `assertRootDeploy()` in `src/lib/seo.ts` fails the build on a `site` carrying a
path or a non-`/` `base`, and every internal link and asset reference is a rooted path, so
served under `/technoise/` the CSS, fonts, brand SVGs and navigation all 404. The tradeoff of
taking the free URL is unchanged: you can never move the URL later without losing accumulated
search ranking.

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
│  ├─ CNAME              does not exist yet — pending the custom-domain wiring; see Phase 5
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
1. Create the GitHub repo, public — required, not a default: GitHub Pages on the free tier
   serves public repos only.
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
   it needs an absolute sitemap URL. The hostname is set once in `astro.config.mjs` and
   derived from there by `src/lib/seo.ts`, so it is never written as a literal anywhere in
   `src/` and changing it stays a one-line edit (Part 0 Decision 3: Registrar and DNS).
4. JSON-LD: `WebSite` + `Person` on home, `BlogPosting` on posts, `CreativeWork` on
   projects, `BreadcrumbList` on posts, projects and tag archives. `Person` on About is
   deferred until that page exists (Part 5) — it's a two-line addition when it's built.
5. One static OG image fallback (`public/og/technoise-og.png`), not per-page generation —
   three content entries didn't justify a renderer dependency.

**Done when:** view-source on three different page types shows three different titles,
descriptions, and canonicals — no duplicates. Verified.

### Phase 5 — Deploy (1 evening)
1. Push to `master`. That triggers `.github/workflows/deploy.yml`, which installs, builds and
   uploads the artifact in its `build` job and publishes it from its `deploy` job. There is
   no build command or output directory to configure anywhere — `withastro/action` supplies
   both.
2. Enable Pages: repo Settings → Pages → Build and deployment → Source: **GitHub Actions**.
   Until this is set the `deploy` job has nothing to publish to.
3. Confirm the run is green in the Actions tab and the `github-pages` environment shows a
   deployment URL.
4. Buy the domain (Decision 3) if it isn't bought.
5. Add `public/CNAME` containing the bare domain.
6. Enter the same domain under Settings → Pages → Custom domain.
7. **Choose apex or `www` and let the other redirect.** The apex is canonical:
   `astro.config.mjs` already names `https://technoise.dev`, which makes it the zero-change
   option, and GitHub Pages serves an apex domain directly. Point `www` at Pages with the
   `CNAME` record so GitHub redirects it to the apex. Pick one now; changing it later splits
   your search ranking across two hostnames.
8. Create the DNS records at whatever provider holds the zone — the canonical list, the
   DNS-only/proxy caveat and the CAA note are all in Decision 3.
9. Wait for GitHub's DNS check to pass, then tick **Enforce HTTPS**. Certificate issuance can
   take up to 24 hours; on a `.dev` domain there is no HTTP fallback in the meantime (see
   Decision 3), so the domain is simply unreachable in a browser until the certificate lands.
   That is expected, not a broken deploy — don't start changing things.
10. After the cutover, confirm no second indexable origin persists: once the custom domain is
    set, GitHub serves `<username>.github.io/<repo>` as a redirect to it. Check that rather
    than assuming it.

**What can and cannot be verified before DNS.** This repo is `ladoyle/technoise`, a project
repo, so the default Pages URL is `https://ladoyle.github.io/technoise/` — a project subpath.
The site will **not** render correctly there: `site` is the custom domain and every asset and
link is a rooted path, so under `/technoise/` the CSS, fonts, brand SVGs and nav all 404.
That is the documented consequence of the root-deploy-only design (`assertRootDeploy()` in
`src/lib/seo.ts`), not a deploy fault. Pre-DNS verification is therefore limited to what is
actually verifiable: the workflow ran green, the artifact uploaded, the `deploy` job
published, and the default URL returns HTML rather than a 404. Page-level verification waits
until the custom domain resolves.

**Adding `public/CNAME` is a code change that trips a standing test.**
`tests/brand-assets.test.ts`'s "public/ ships nothing the site references nowhere" suite
enumerates `public/` and fails on any file whose rooted URL path appears nowhere in `src/` —
and a `CNAME` file is by definition referenced nowhere in `src/`. Its `UNREFERENCED_BY_DESIGN`
list cannot absorb the file as-is either: a second assertion in the same suite holds every
exemption to a file `BRAND_FILES` already guards. So whoever adds `public/CNAME` widens that
guard deliberately — an exemption category for host-configuration files `src/` cannot
reference by design — and updates the `AGENTS.md` paragraph documenting the `public/` rule in
the same change. Weakening or deleting the assertion is not an acceptable substitute; the
guard exists because four orphaned PNGs shipped for months (Issue #32). Neither the file nor
the test change is part of this documentation pass.

**Done when:** the custom domain serves over HTTPS and every internal link uses it.

### Phase 6 — Indexing (30 minutes, then waiting)
1. **Google Search Console** → add property → **Domain** property (not URL prefix) → it
   gives you a TXT record → add it at your DNS provider (Cloudflare DNS, or wherever the zone
   lives — DNS is decoupled from the host; see Decision 3) → verify. Domain properties cover
   every subdomain and both protocols, which saves grief later.
2. Submit `https://yourdomain/sitemap.xml` under Sitemaps. Confirm it reports "Success" and a
   page count matching reality.
3. URL Inspection → Request Indexing for home, `/blog/`, `/projects/`, `/resume/`, `/about/`.
4. **Bing Webmaster Tools** → add site → import from Search Console. Two minutes, covers Bing
   and every engine downstream of it.
5. Run Lighthouse on mobile. Target Performance ≥ 90, Accessibility ≥ 95, SEO = 100.
6. Analytics is an **open decision** — no tool is chosen, nothing is implemented, and a
   separate proposal will settle it. The recommendation that used to sit here — Cloudflare's
   own web-analytics product — lapsed with the host change rather than being dropped
   silently. It was free and required no cookie banner because Cloudflare proxied every
   request; with GitHub Pages serving the origin and Cloudflare (if used at all) doing DNS
   only, it is no longer in the request path. GitHub Pages provides no built-in analytics of
   its own.

**Done when:** Search Console shows the sitemap read successfully and at least the homepage
indexed.

**Realistic expectation:** a brand new domain with no inbound links typically takes days to
a few weeks for first indexing, and longer to rank for anything. Nobody can shorten this and
anyone who says otherwise is selling something. Publishing consistently and getting a handful
of real inbound links (GitHub profile, LinkedIn, dev.to crossposts, HN or Reddit comments
where genuinely relevant) does more than any technical tweak at this stage.

### Phase 7 — Per-post routine (5 minutes)
Write Markdown → push to `master` → `.github/workflows/deploy.yml` rebuilds and redeploys →
confirm the URL appears in `sitemap.xml` → Request Indexing in Search Console.

A push to `master` starts `ci.yml` and `deploy.yml` as independent workflows. The deploy does
not wait for `astro check` and the test suite, so a red `verify` publishes anyway. Catching a
problem *before* it deploys means opening a pull request — that is what `ci.yml` runs on.

### Phase 8 — Monthly (15 minutes)
Search Console coverage report → fix errors. Check for dependency security advisories.
Confirm the build still passes. Once a year: renew the domain, upgrade the major version.

---

## Part 3 — Cost ledger

```
domain (.com, at cost)     $10.44/yr  → ~$11.15/yr after 1 Nov 2026
                                      (configured hostname is a .dev — confirm its
                                       at-cost price before trusting this total)
hosting (GitHub Pages)     $0
DNS + SSL                  $0         (SSL: GitHub-provisioned certificate;
                                       DNS: whichever provider holds the zone)
analytics                  $0         (pending — no tool chosen)
Search Console / Bing      $0
GitHub (public repo)       $0         (required — the free Pages tier serves public repos)
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
- [ ] Canonical URLs are absolute and use the chosen hostname — absolute: done; this guide
      and the repo now agree on GitHub Pages, and `https://technoise.dev` in
      `astro.config.mjs` is the intended custom domain. Unticked until it actually resolves.
- [ ] OG image renders correctly in a social preview debugger — image is built and
      committed (1200×630, cream field, no crop); not run against a debugger, which needs
      a publicly reachable URL and the site isn't deployed yet
- [x] `sitemap.xml` lists every public page and no drafts
- [x] `robots.txt` allows crawling and references the sitemap
- [ ] RSS validates — parses under a real XML parser with the required channel elements,
      `xmlns:atom` and `atom:link rel="self"`; the W3C Feed Validation Service itself
      wasn't reachable in this environment to run the last mile of this check
- [ ] `public/CNAME` created — it does not exist yet, and adding it also means widening the
      `public/` reference guard in `tests/brand-assets.test.ts` and the `AGENTS.md` paragraph
      that documents it, in the same change (see Phase 5)
- [ ] DNS records created at the provider holding the zone, and the domain entered under
      Settings → Pages → Custom domain — neither is done
- [ ] Apex/`www` decision made, other one redirects — GitHub Pages issues that redirect
      itself once both hostnames point at it, so there is no redirect rule to write
- [ ] HTTPS enforced — Settings → Pages → Enforce HTTPS, available once GitHub's DNS check
      passes and the certificate is issued
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
- Preferred domain name, and a backup — `technoise.dev` is already configured in
  `astro.config.mjs`, so what's needed is confirmation of it (and the backup), not a fresh
  choice
- Contact preference: email, form, or social only
- Nothing to decide on repo visibility: the repo is public and must stay public, because
  GitHub Pages on the free tier serves public repos only. Making it private takes the site
  offline

Project details, work history, and opinions won't be invented — bring notes and they'll get
shaped into the site's voice.
