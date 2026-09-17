# TechNoise — Agent Contract

Every agent reads this file before doing anything else. It is the single source of
truth for development style, workflow, and handoffs. Where this file and a prompt
disagree, ask rather than guess.

The full design plan and phase roadmap lives in [`docs/setup-guide.md`](docs/setup-guide.md).

---

## Stack and run configuration

| | |
|---|---|
| Generator | Astro 7 (static output; one justified JS island — see below) |
| Node | `>=22.12.0`, pinned in `.nvmrc` |
| Package manager | npm, lockfile committed |
| Host | GitHub Pages via `.github/workflows/deploy.yml` on push to `master` |
| Content | Markdown in `src/content/`, typed frontmatter schemas |

Astro still emits zero client JS by default — every page ships one exception: the header's
mobile nav disclosure (`html.js` class hook in `BaseLayout`, plus `Header`'s own bundled
module). It exists because `aria-expanded`/`aria-controls`, Escape-to-close and
click-outside cannot be built in HTML and CSS alone; see "Accessibility and performance
floors" below for the standard that justifies an island, and `Header.astro` for the only
one that currently meets it. Without JS the nav degrades to the full link list, stacked —
no broken affordance.

```sh
npm install          # install dependencies
npm run dev          # dev server on localhost:4321
npm run build        # production build to ./dist/
npm run preview      # serve the built output
npx astro check      # type and template diagnostics
npm test             # vitest run — schema, publishing-rule, build-output, SEO-helper,
                      # discovery-output (sitemap/rss/robots) and nav/route-resolution tests
                      # (tests/nav-contract.test.ts also carries the resume page's
                      # privacy-regression assertions, not just nav contract tests; and
                      # tests/build-output.test.ts also carries CSS-cascade/specificity
                      # assertions for the hero ghost-CTA hover rule, not only markup checks)
```

When starting the dev server as an agent, use background mode: `astro dev --background`.
Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`. Never leave a
foreground dev server blocking a turn.

Astro's content loader caches parsed entries in `node_modules/.astro/data-store.json`, not
in `.astro/`. Deleting or renaming a file in `src/content/` and re-running `npm run build`
can still emit its page from that cache — clear it with `rm -rf node_modules/.astro` (a
plain `rm -rf .astro dist` is not enough). CI is unaffected: the deploy workflow always
installs into a clean `node_modules`.

`vitest.config.ts` sets `fileParallelism: false`. Two suites (`build-output.test.ts`,
`discovery-output.test.ts`) each shell out to `astro build` in the repo root; run in
parallel they race over the same `dist/` and `node_modules/.astro` and one build dies.
Leave it off — the cost is about 1.5s on a ~16s suite, and any future test file that shells
out to `astro build` inherits the same hazard.

---

## Repo layout

```
technoise/
├─ .claude/agents/      designer, developer, qa, documenter, gatekeeper
├─ docs/                setup-guide.md — design plan and phase roadmap
├─ reports/             agent handoff reports (git-ignored)
├─ src/
│  ├─ assets/           astro:assets input — processed and hashed at build, unlike public/
│  ├─ content.config.ts schema for the collections below (Astro 7 path — not src/content/config.ts)
│  ├─ content/          blog/ and projects/ — one Markdown file per entry
│  ├─ components/       reusable, from the component inventory below
│  ├─ layouts/          page shells
│  ├─ lib/              shared TypeScript helpers (publishing rules, formatting, SEO),
│  │                    plus resume.ts — content, not logic; see the privacy rule below
│  ├─ pages/            routes, plus generated non-HTML endpoints (sitemap.xml.ts,
│  │                    rss.xml.ts, robots.txt.ts)
│  └─ styles/           tokens.css and global styles
├─ public/brand/        committed logo sources
└─ .github/workflows/   deploy.yml
```

`public/brand/*.svg`'s viewBoxes are trimmed to ~88% ink (no wasted transparent margin) —
`.site-header__brand img`, `.site-footer__brand img` and the `<img width height>` pair
(`918`/`835`, the presentation file's own extents) all assume that framing. Re-exporting or
re-cropping any of these three files means revisiting all three of those places, or the mark
renders at the wrong size or off-center in its reserved box. `tests/brand-assets.test.ts`
asserts the declared size matches each file's own `viewBox`, so a desync fails the suite
instead of shipping quietly.

`src/lib/resume.ts` is the first `src/lib/` module that holds content rather than logic — the
resume's copy, dates and skills, not a helper. Its types are load-bearing for a standing
privacy rule, not just for correctness: **`/resume/` may never publish a phone number or a
city/state/other location, in its visible text, its JSON-LD, or its metadata.** The module's
types carry no field either could occupy, and `tests/nav-contract.test.ts` asserts this at
three layers — the built HTML, the parsed JSON-LD, and the exported `RESUME` object's own
keys — so a location field added before anything renders it still fails the suite. This rule
outlives the cycle that added it: treat any future edit to `resume.ts` or `resume.astro` as
bound by it, not just the one that shipped the page.

---

## Design standards

These are binding. A change that violates them is a defect, not a preference.

### Color tokens

Defined once as CSS custom properties in `src/styles/tokens.css`. Never hardcode a hex
value anywhere else.

| Role | Token | Value | Contrast on cream | Rule |
|---|---|---|---|---|
| Page background | `--cream` | `#FDF9F3` | — | The page is cream, never pure white |
| Body text | `--ink` | `#0C3242` | 12.9:1 | Passes AAA |
| Link text | `--signal-700` | `#0A6F94` | 5.4:1 | Use for all body links |
| Raw signal | `--signal` | `#0C83AE` | 4.1:1 | **Fails AA** — large text, icons, borders only |
| Orange text | `--pulse-700` | `#B94614` | 5.1:1 | Orange text on cream |
| Raw pulse | `--pulse` | `#F75E1A` | 3.1:1 | Button *fills* and rules only, never text on cream |
| Borders / muted UI | `--slate` | `#C2D1D8` | 1.5:1 | Decorative only |

Dark mode (ink becomes the page, via `prefers-color-scheme`): links lighten to `#6EC9E8`
(7.2:1 on ink), accents to `#FF9F6B` (6.7:1 on ink). Both are tints of the brand bases —
do not introduce new hues.

**One legitimate exception to "never hardcode a hex value":** the three brand SVGs in
`public/brand/` (`technoise-icon.svg`, `technoise-logo-presentation.svg`,
`technoise-logo-full.svg`) plus `public/favicon.svg`. They're referenced by `<img src>` /
`<link>` URL, not inlined, so they cannot read this page's CSS custom properties — each file
carries its own fills as literal hex, three classes (`.tn-ink`, `.tn-signal`, `.tn-pulse`)
with a `prefers-color-scheme: dark` override that must byte-match `--ink`/`--signal`/`--pulse`
in light mode and `--cream`/`--signal-300`/`--pulse-300` in dark. `tests/brand-assets.test.ts`
reads `tokens.css` at test time and asserts the match — that test, not a code review, is what
keeps this exception honest. Don't "fix" the hardcoded hex in these files without re-running
it; a token edit that isn't mirrored here silently desyncs to an ink-on-ink wordmark in dark
mode (measured 1.00:1 — invisible, not just off-color).

### The three posture rules

1. **Orange appears once per screen.** It is the "do this" color. Three orange things on a
   page means the page has no call to action. **Carve-out:** the `.tn-pulse` headphones baked
   into the brand logo SVGs (`Header.astro`, `Footer.astro`) don't count against this budget.
   They're fixed brand chrome — the same class of exception the color-token table already
   grants raw `--signal` for "icons, borders only" — not a page-content "do this" signal. A
   page's actual call to action still gets exactly one orange fill; two logo instances plus one
   CTA is the correct, intended count, not a violation.
2. **Cream is the page, never white.** Pure white next to `#FDF9F3` reads as a rendering bug.
3. **The mascot is a guest, not wallpaper.** This applies to the mascot as *page content or
   illustration* — home hero, About, and 404 only (`src/assets/technoise-background.png` and
   anything like it stays confined to those three pages). It does not apply to the mascot as
   *part of the fixed brand lockup*: the header and footer logos (`public/brand/*.svg`) and the
   favicon render on every page, exactly as any site's logo and favicon would. That's not
   wallpaper, it's signage — the distinction is illustration-of-the-page vs. identity-of-the-
   site.

Editorial layout, generous whitespace, one column of readable text. No cards-in-cards, no
gradients, no shadow deeper than a hairline.

### Type and rhythm

- **Two families maximum**: one humanist sans for everything, one mono for code.
- **Body**: 18px mobile, 19–20px desktop. Measure capped at 68–72 characters.
- **Line height**: 1.65 body, 1.2 headings.
- **Type scale (1.25)**: 14 / 16 / 18 / 20 / 25 / 31 / 39 / 49 px. Nothing outside it.
- **Spacing scale**: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px. Nothing outside it.
- **Grid**: single 720px content column, widening to 1100px only for project card grids and
  the footer. Gutters 24px mobile, 48px desktop.

`48em` is the site's one responsive hinge, reused deliberately rather than adding a second
breakpoint to reason about. It now carries three responsibilities: `Header.astro`'s nav
collapse, `Footer.astro`'s three-column grid, and — since `7e3924d` — both components'
`<picture><source media="(min-width: 48em)">` brand-logo swap. That third one lives in an HTML
attribute, not a CSS media query, so a future change to the breakpoint value has to be made in
both languages across `Header.astro`, `Footer.astro` and `tokens.css`.
`tests/brand-assets.test.ts` pins the `<source media>` value to `48em`, so a mismatch fails the
suite instead of drifting silently.

### Component inventory

Build once, reuse everywhere:

Header · Footer · PostCard · ProjectCard · TagPill · Prose block · CodeBlock with copy
button · Callout · Pagination · Breadcrumb · ThemeToggle · SEO head block · OG image template

If a page needs a thirteenth component, question the page before adding it.

**ThemeToggle has a hard prerequisite.** `Header.astro` and `Footer.astro` reference the brand
SVGs by URL, so their dark-mode fills follow the OS `prefers-color-scheme` only — a `data-theme`
attribute on `<html>` cannot reach inside a URL-referenced image. Whoever builds ThemeToggle
must, in the same change, either inline these SVGs (so page-level `data-theme` CSS can target
their classes) or serve scheme-specific files swapped by `data-theme`. Shipping ThemeToggle
without doing one of those gives a user who OS-light/manually-dark an invisible, ink-on-ink
wordmark in the header and footer — measured, not theoretical.

`Prose` forwards unrecognized props (`...rest`) onto its root `<div>`, not just `class`.
Astro hands a child component its parent's scoped-style attribute as a prop, and the child
has to place it on its own root or the parent's scoped rules never match — `<Prose
class="sg-narrow">` needs the spread to receive `sg-narrow`'s own CSS. Every call site
today passes only `class`; keep it that way, since the spread also means a typo'd prop name
type-checks and lands silently in the DOM.

### Accessibility and performance floors

Non-negotiable on every change:

- Keyboard-only navigation works; focus states are visible.
- Layout holds at 320px and in dark mode.
- Body text meets 4.5:1 contrast; large text 3:1.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO = 100.
- Zero client JS unless a feature genuinely requires an island.

---

## Code conventions

- TypeScript for anything with logic; typed frontmatter schemas for all content collections,
  defined in `src/content.config.ts` using the `glob()` loader from `astro/loaders`. Astro 7
  throws `LegacyContentConfigError` on the pre-7 `src/content/config.ts` path — the config
  file lives beside `src/pages/`, not inside `src/content/`.
- Components are `.astro` by default. Reach for a framework island only when interactivity
  cannot be done with HTML and CSS, and say why in the handoff report.
- Styles go in `src/styles/` or a component's own `<style>` block. Tokens only — no raw hex,
  no off-scale sizes or spacing.
- Semantic HTML first: a `<button>` is a button, a `<nav>` is a nav.
- Absolute canonical URLs; unique title (≤60 chars) and description (≤155 chars) per page.
- Comments explain *why*, never *what*. Default to none.
- Do not add dependencies without flagging it in the handoff report — every dependency is a
  future upgrade and a supply-chain surface.
- `astro.config.mjs` carries a Shiki transformer that strips Shiki's own inline colours from
  fenced code blocks so `prose.css` — not Shiki's theme — styles them, and keeps the
  `tabindex="0"` Astro puts on the resulting `<pre>` (required for a scrolling region to be
  keyboard-reachable). Don't reintroduce a Shiki theme or `markdown.syntaxHighlight: false`
  without accounting for both.
- **Route-scoped stylesheets are imported by the page that needs them, not by `BaseLayout` or
  a shared component.** `src/styles/print.css` is the first of these, and the repo's first
  `@media print` rules — imported only by `src/pages/resume.astro`, so the rules ship on that
  route alone. A print block that resets tokens back to the light scheme (so a reader whose OS
  is dark doesn't print cream-on-dropped-background) has to **out-specify or evade** the
  dark-scheme block in `tokens.css`, not merely follow it in source order: media queries add
  no specificity, so a bare `@media print { :root { … } }` loses to `:root:not([data-theme=
  "light"])` regardless of which stylesheet a bundler emits last. `tokens.css` avoids the trap
  by scoping both dark-scheme blocks to `@media screen`, so a print reset never has to
  out-specify them in the first place — keep any future dark-scheme rule scoped the same way,
  or a new route-scoped print stylesheet inherits the same inert reset.

### Page SEO

Every page renders through `BaseLayout`, which feeds `<SeoHead>` (the inventory's SEO head
block) and owns nothing else a crawler or social client reads. A page passes:

- `title`, `description` — required. `title` is the full `<title>` text (callers append
  `SITE.titleSuffix` via `pageTitle()` from `src/lib/seo.ts`; the home page alone stays
  bare). `description` doubles as the card summary and the meta description.
- `canonicalPath?` — omit it and the layout derives one from the page's own URL via
  `canonicalPath(Astro.url)`, so a new route is canonical by default, not by remembering.
- `noindex?` — emits `noindex, nofollow` instead of the default
  `index, follow, max-image-preview:large`. `/styleguide/` is the only page that uses it, and
  the only route absent from `STATIC_SITEMAP_ROUTES`. `/resume/` used to share both while it
  was a stub; lifting `noindex` and adding the route was the one-line change that shipped
  once the page had real content — the pattern to repeat for any future stub.
- `ogType?`, `article?` — Open Graph/Twitter overrides. The card image is not a prop: every
  page shares the committed OG card (`OG_IMAGE` in `src/lib/seo.ts`).
- `prevPath?` / `nextPath?` — paginated listings only; emits `rel="prev"` / `rel="next"`.
- `schema?` — an array of JSON-LD `@graph` nodes; omitted or empty emits no `<script>` tag.

No absolute URL — canonical, `og:url`, `og:image`, JSON-LD `@id`, sitemap `<loc>`, RSS
`link`/`guid` — is ever written as a literal hostname. Every one derives from `site` in
`astro.config.mjs` through the helpers in `src/lib/seo.ts` (`absoluteUrl`, `canonicalPath`,
`pageTitle`, …). A test walks `src/` and fails the suite if a `technoise.dev` or `github.io`
literal ever appears, so changing the domain stays a one-line edit to `astro.config.mjs`.

### Content authoring rules

Binding for every entry in `src/content/blog/` and `src/content/projects/`, enforced by the
schema in `src/content.config.ts`:

- `title` ≤48 characters. Every page renders `` `${title} — TechNoise` ``; the suffix costs
  12 of the 60-character `<title>` budget, so 48 is the full remaining allowance, not a
  stylistic choice.
- `description` ≤155 characters. It is the card summary, the detail-page lede, and the meta
  description — one field, not three.
- `tags`: lowercase, hyphenated (`^[a-z0-9]+(-[a-z0-9]+)*$`), ≤24 characters each, 1–4 per
  entry. Stored and displayed in slug form so `"Astro"` and `"astro"` can't open two archives
  for one idea.
- A post's filename (its slug) may not be a bare number — it collides with the `/blog/<n>/`
  pagination routes and fails the build with the colliding filename in the error.
- `draft: true` hides an entry from production builds only; `astro dev` still shows it.
- Astro renders raw HTML inside Markdown by default, so a `.md` file is as privileged as a
  component. Every file in `src/content/` today is repo-authored and reviewed; if content is
  ever accepted from outside the repo (an external PR, a CMS), add a rehype sanitizer at that
  point rather than after the fact.

---

## Workflow

The production cycle is a one-way pipeline. Each stage reads the report from the stage
before it and writes exactly one report for the stage after it.

```
designer ──design-report──▶ developer ──dev-report──▶ qa ──qa-report──▶ documenter ──▶ PR
                                 ▲                      │
                                 └──── blocking ────────┘
                                       findings

PR ──▶ gatekeeper ──▶ review comments  ──▶  human merges (or doesn't)
            │
            └── MAJOR finding ──▶ GitHub Issue ──▶ developer on bugfix/<slug> ──▶ qa ──▶ PR
```

- **designer** — produces a numbered checklist of changes to make, plus whatever prose,
  measurements and markup *excerpts* the report needs to be unambiguous. The report is the
  whole deliverable: the designer never commits `.astro` or `.css` files. A committed
  template reads as source, drifts away from `src/` the moment the developer implements it,
  and the next cycle picks up the stale copy.
- **developer** — implements every checklist item, one commit per coherent unit.
- **qa** — reviews for vulnerabilities, writes unit tests, judges production readiness.
  A blocking verdict sends the work back to developer with the same report as input.
- **documenter** — updates README, AGENTS.md, and docs when architecture, design standards,
  or run configuration changed. Runs last, and only when something durable changed. Opens
  the PR.
- **gatekeeper** — reviews the open PR on GitHub for production issues, bugs, warnings, and
  code smells. Comments on every finding; files a GitHub Issue for each MAJOR one. Always
  submits as `COMMENT` — never `REQUEST_CHANGES`, never `APPROVE`.

`qa` runs before the PR exists and gates the handoff. `gatekeeper` runs on the PR itself and
asks the different question: *if this merges and deploys, what goes wrong?* It treats the QA
report as a claim to test, not a result to trust.

**A human decides what merges.** No agent approves, and no agent merges. The gatekeeper's
review is advisory — if the human merges over it, that is final, and the Issue already filed
carries any real finding forward.

### Bugfix loop

A MAJOR gatekeeper finding becomes a GitHub Issue, not a blocked PR. The issue is picked up
independently:

1. Branch `bugfix/<short-slug>` from an up-to-date `master`.
2. `developer` implements against the issue's acceptance criteria, referencing the issue
   number in the commit.
3. `qa` verifies as normal and writes `reports/qa-report.md`.
4. A new PR to `master`, reviewed by `gatekeeper`, merged by a human.

This keeps a follow-up fix from silently widening the PR that surfaced it.

---

## Handoff protocol

- All reports live in `reports/`. The directory is git-ignored — reports are working state,
  not deliverables.
- Each stage writes **one** report at a fixed path, overwriting the previous one:

  | Stage | Writes | Reads |
  |---|---|---|
  | designer | `reports/design-report.md` | — |
  | developer | `reports/dev-report.md` | `reports/design-report.md` |
  | qa | `reports/qa-report.md` | `reports/dev-report.md` (+ design report for intent) |
  | documenter | `reports/doc-report.md` | `reports/qa-report.md` |
  | gatekeeper | `reports/gatekeeper-report.md` | the PR diff (+ qa report as a claim to test) |

- **Only the latest report counts.** Before overwriting, move the existing file to
  `reports/archive/<name>-<YYYYMMDD-HHMMSS>.md`. Archives are for humans debugging a cycle;
  agents never read them.
- Every report starts with the same header block so the next stage can validate its input:

  ```markdown
  ---
  stage: designer | developer | qa | documenter
  feature: short-slug
  branch: feature/short-slug
  date: YYYY-MM-DD HH:MM
  upstream: reports/<file>.md | none
  status: ready | blocked
  ---
  ```

- If the upstream report is missing, stale (points at a different feature or branch), or
  `status: blocked`, stop and report that to the human. Do not improvise the missing stage.
- Checklist items carry stable IDs (`D1`, `D2`, …) assigned by the designer. Every later
  stage refers to work by that ID so a human can trace one line from design to test.
  Gatekeeper findings use `G1`, `G2`, … in the same way.
- The gatekeeper is the one stage whose real output lives on GitHub — review comments and
  Issues, where reviewers actually look. Its report is a local record of that review, not
  the deliverable. A reviewer must never have to open a git-ignored file to learn what was
  flagged.

---

## Git rules

These are hard limits on every agent.

- **Work happens on a feature branch.** `feature/<short-slug>` for new work, or
  `bugfix/<short-slug>` when resolving a gatekeeper Issue. Both branch from an up-to-date
  `master`. Never commit directly to `master`.
- **Agents push to feature and bugfix branches only.** Never push to `master`, never
  force-push a branch an agent did not create, never rewrite published history.
- **Raise a PR to `master` for human review.** The documenter (or whichever stage finishes the
  cycle) opens it. No agent approves or merges its own work — or anyone else's. That includes
  the gatekeeper, whose review is a signal, not a veto.
- **Every GitHub comment, review, and issue ends with the attribution footer**, so reviewers
  know it was agent-authored:

  ```

  ---
  _Generated by [Claude Code](https://claude.ai/code)_
  ```
- Commit messages: imperative subject under 72 chars, body explaining *why*. Reference
  checklist IDs where they apply.
- Never commit `reports/`, `dist/`, `node_modules/`, or anything matching `.gitignore`.
- Run `git status` before any command that could discard uncommitted work.
