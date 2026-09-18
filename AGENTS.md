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
| Node | floor `>=22.12.0` in `engines`; `.nvmrc` names the major line (`24`) both workflows build on — `ci.yml` via `node-version-file`, `deploy.yml` via an explicit `node-version` input to `withastro/action`, pinned to `.nvmrc` by `tests/ci-workflow.test.ts` |
| Package manager | npm, lockfile committed |
| Host | GitHub Pages via `.github/workflows/deploy.yml` on push to `master` |
| CI | `.github/workflows/ci.yml` — `npm ci`, `npx astro check`, `npm test` on every pull request and every push to `master` |
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
npm test             # vitest run — schema, publishing-rule, content-helper, build-output,
                      # SEO-helper, discovery-output (sitemap/rss/robots),
                      # nav/route-resolution, brand-asset, workflow-permissions,
                      # test-harness-contract, ci-workflow, dependency-contract,
                      # palette-tokens and a11y-verify-script tests (14 files, 289 tests)
                      # (tests/nav-contract.test.ts also carries the resume page's
                      # privacy-regression assertions, not just nav contract tests — its
                      # phone-shape scan strips <svg>…</svg> from the visible HTML first,
                      # since the header's inlined brand mark puts viewBox coordinates on
                      # every page, including /resume/, that can otherwise look phone-shaped;
                      # tests/build-output.test.ts also carries CSS-cascade/specificity
                      # assertions for the hero ghost-CTA hover rule, asserts every
                      # dark-scheme CSS rule in the shipped output stays `@media screen`-
                      # scoped, and asserts the 404 page and the home hero each resolve to
                      # their own hashed art derivatives (never the other's) and keep their
                      # own `object-position`, not only markup checks;
                      # tests/brand-assets.test.ts also reads dist/**/*.html now, not just
                      # the source SVGs under public/brand/ — one suite resolves the header's
                      # inlined-mark var() rules through tokens.css and pins them to each
                      # brand file's own declared colours, in both schemes; another walks
                      # every built page's injected header markup asserting it ships inert
                      # (no script, handler or external reference) and still tokenised (no
                      # hex, no fill/stroke presentation attribute); it also carries a second
                      # SVG parser (parseFlatSvg, for a file with no internal dark block) and
                      # a third tracked list (assetTracked, alongside tokenTracked and
                      # BRAND_FILES) that folds public/favicon-dark.svg into the geometry,
                      # ink-floor and inertness loops; a "the two-file favicon" suite asserts
                      # favicon.svg still carries its internal dark block on purpose and that
                      # favicon-dark.svg is favicon.svg with only its <style> replaced, no
                      # @media of its own; and a "BaseLayout hands the scheme choice to the
                      # document" suite reads dist/index.html and pins the three icon links'
                      # hrefs, media and order — the first assertion in this file about the
                      # document's <head> rather than about an asset;
                      # tests/ci-workflow.test.ts pins ci.yml's job name, triggers and
                      # run steps — workflow-permissions.test.ts asserts how a workflow is
                      # permitted, this one asserts that it actually runs the gates — and
                      # also pins deploy.yml's node-version input against .nvmrc;
                      # tests/dependency-contract.test.ts pins devDependencies.sharp to the
                      # range the installed astro declares for its own image service, and
                      # asserts the lockfile holds exactly one sharp, not one marked
                      # "optional: true"; tests/palette-tokens.test.ts reads tokens.css
                      # and re-derives every ratio the styleguide prints, so it also carries
                      # that page's own prose-figure assertions, not just src/lib/palette.ts's;
                      # and tests/a11y-verify-script.test.ts is the first suite to cover a file
                      # under .claude/skills/ — verify-contrast.mjs is exercised by no build or
                      # check path otherwise, so it pins the repo's one page.screenshot() call
                      # to clip-only (no fullPage), pins scrollIntoViewIfNeeded() ahead of
                      # boundingBox() in sampleRenderedBackground(), and asserts no catch there
                      # coexists with the "zero-size element" fallback message, all via static
                      # source reads, no browser, no build)
```

When starting the dev server as an agent, use background mode: `astro dev --background`.
Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`. Never leave a
foreground dev server blocking a turn.

Astro's content loader caches parsed entries in `node_modules/.astro/data-store.json`, not
in `.astro/`. Deleting or renaming a file in `src/content/` and re-running `npm run build`
can still emit its page from that cache — clear it with `rm -rf node_modules/.astro` (a
plain `rm -rf .astro dist` is not enough). CI is unaffected: both workflows always install
into a clean `node_modules`.

`tests/global-setup.ts` runs `astro build` exactly once per vitest invocation, before any
test file loads; the five HTML-reading suites (`build-output.test.ts`,
`discovery-output.test.ts`, `nav-contract.test.ts`, `brand-assets.test.ts` and
`palette-tokens.test.ts`) only ever `readFileSync` out of `dist/`.
`vitest.config.ts` no longer sets `fileParallelism: false` — the race that setting guarded
against (two suites each shelling out to `astro build` concurrently) no longer exists, since
no suite builds for itself. **A test file must never run `astro build` itself** — it reads
the `dist/` that `globalSetup` already produced. `tests/test-harness-contract.test.ts` is
what makes this binding, the same role `tests/brand-assets.test.ts` plays for the brand-SVG
hex exception: it asserts `globalSetup` stays registered in `vitest.config.ts` and that no
file matching `tests/**/*.test.ts` shells out to a build, so either regression fails the
suite instead of quietly reintroducing a stale-`dist/` or a build race. `globalSetup` runs
once per vitest *invocation*, not per file-change, so `vitest --watch` does not get this
guarantee — a change to a `.astro` page won't trigger a rebuild mid-watch-session unless a
test file itself changed. Use `npm test` (run mode) for the freshness guarantee; don't trust
a long-lived watch session to have a current `dist/`.

---

## Repo layout

```
technoise/
├─ .claude/agents/      designer, developer, qa, documenter, gatekeeper
├─ .claude/skills/      a11y-verify, safe-install
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
├─ public/brand/        the three live logo SVGs — anything here is published
├─ public/fonts/        the self-hosted Inter woff2 that fonts.css loads
├─ public/og/           the one committed Open Graph card (OG_IMAGE in src/lib/seo.ts)
├─ public/favicon.*     .ico plus two scheme-scoped SVGs — three files, three links, see below
├─ archive/             versioned but never built or served — see the rule below
├─ tests/               vitest suites, plus global-setup.ts — the one build they all read
└─ .github/workflows/   ci.yml (checks on PRs), deploy.yml (Pages)
```

`public/favicon.*` is three files, not "an .ico and a .svg": `favicon.ico`, `favicon.svg`
(light fills as its defaults, plus its own internal `@media (prefers-color-scheme: dark)`
override) and `favicon-dark.svg` (the dark fills stated unconditionally, no media query of its
own). `BaseLayout.astro`'s `<head>` links all three, in this order: `.ico` (no `media`) →
`favicon-dark.svg` (`media="(prefers-color-scheme: dark)"`) → `favicon.svg`
(`media="(prefers-color-scheme: light)"`). Two things about this look like cleanup targets and
are not:

- **`favicon.svg` keeps its internal dark `@media` block on purpose.** It is a fallback for an
  engine that ignores the `media` attribute on a `<link rel="icon">` but still honours a
  `prefers-color-scheme` query inside the referenced SVG (documented Gecko behaviour, not
  independently verified here — neither Gecko nor WebKit is installed in this environment).
  Stripping it would trade the bug this cycle fixed in Chromium for an equivalent one in
  Firefox.
- **The link order — dark before light — is load-bearing, not arbitrary.** An engine that
  ignores `media` entirely and falls through to the last declared icon must land on
  `favicon.svg`, the file that still self-adapts internally, never on `favicon-dark.svg`
  alone: that file measures 1.20:1 on a light surface, since it has no light rules at all.

Reference by URL, not inlined, so both SVGs sit under the hex exception in "Color tokens"
below, the same as the three `public/brand/` files.

`archive/` exists because `public/` does not mean "kept" — it means "deployed": anything
under it is copied verbatim into `dist/` and published at a guessable URL on the canonical
origin. `archive/brand-pre-svg-migration/` (Issue #32) holds the four pre-SVG-migration brand
PNGs, kept because `docs/setup-guide.md`'s asset-prep table still names them as source
material for exports (`icon-192`, `icon-512`, `apple-touch-icon`, social profile images) that
have not been made yet. A file that must stay in the repo but must never be served belongs
outside `public/` — `archive/` is that place, the same way `src/assets/` is the place for a
file that must be served but only after `astro:assets` processes it.

`public/brand/*.svg`'s viewBoxes are trimmed close to their ink bounds (no wasted transparent
margin) — ~88% ink for `technoise-icon.svg` (0.889) and `technoise-logo-presentation.svg`
(0.883), ~73% for `technoise-logo-full.svg` (0.726): the horizontal lockup carries more
block-axis margin than the other two, and "~88%" does not describe it. `.site-footer__brand
img` and its `<img width height>` pair (`918`/`835`, the presentation file's own extents)
assume that framing — `Footer.astro` still references the files by URL and hand-copies their
extents. `Header.astro` no longer works this way: it inlines both lockups at build time (see
the hex-exception section below) and sizes `.site-header__brand [data-mark]` from each file's
own `viewBox`, read at import time rather than hand-copied, so a re-export cannot desync the
header's box the way it still can the footer's. Re-exporting or re-cropping any of these three
files still means revisiting the footer's hand-copied `918`/`835` pair, or its mark renders at
the wrong size or off-center in its reserved box. `tests/brand-assets.test.ts` asserts the
footer's declared size matches the presentation file's own `viewBox`, asserts the header's
rendered `viewBox`/`width`/`height` matches each source file's own, and floors each file's
ink-to-viewBox height fraction against the figures above, so both a size desync and a re-crop
that thins the ink back out fail the suite instead of shipping quietly.

`src/lib/resume.ts` is the first `src/lib/` module that holds content rather than logic — the
resume's copy, dates and skills, not a helper. Its types are load-bearing for a standing
privacy rule, not just for correctness: **`/resume/` may never publish a phone number or a
city/state/other location, in its visible text, its JSON-LD, or its metadata.** The module's
types carry no field either could occupy, and `tests/nav-contract.test.ts` asserts this at
three layers — the built HTML, the parsed JSON-LD, and the exported `RESUME` object's own
keys — so a location field added before anything renders it still fails the suite. This rule
outlives the cycle that added it: treat any future edit to `resume.ts` or `resume.astro` as
bound by it, not just the one that shipped the page.

`.github/workflows/ci.yml` runs this suite on every pull request, but that makes CI *report*
the failure, not *gate* the merge, until the repo owner marks `verify` (the job `ci.yml`
defines) as a required status check on `master` — Settings → Branches → branch protection
rule for `master` → Require status checks to pass before merging → select `verify`. That
setting is a GitHub repo setting, not something in this repository, so no agent can make it.
Until it's made, a red `verify` still permits a human to merge past this rule, same as any
other check in `ci.yml`.

`.github/workflows/deploy.yml` follows two binding conventions, both born from Issue #14
(a `pages: write` + `id-token: write` grant sitting at workflow level, readable by every job
including one running third-party code):

1. **Permission grants live on jobs, not on the workflow.** The workflow-level block is
   `permissions: {}`; a job inherits nothing and must declare its own scopes, or it runs
   with no access at all. `build`, which is the job that runs third-party code, holds only
   `contents: read`. `pages: write` and `id-token: write` live on `deploy` alone, which runs
   no third-party action.
2. **A third-party action is pinned to a full commit SHA, with its version in a trailing
   comment** (`withastro/action@<40-char sha> # v6.1.3`), never to a mutable tag. Bumping it
   means re-resolving with `git ls-remote` and updating the SHA and the comment together.
   First-party `actions/*` refs stay on tags today; if that changes, it changes for
   `actions/checkout` and `actions/deploy-pages` in the same edit.

`tests/workflow-permissions.test.ts` is what makes both of these binding — the same role
`tests/brand-assets.test.ts` plays for the brand-SVG hex exception: the rule holds because a
test goes red, not because a reviewer remembers. It parses every file under
`.github/workflows/`, so a workflow added later inherits the rule instead of quietly
escaping it. `ci.yml` (Issue #21) is the first workflow added after this rule existed, and it
inherits it without a carve-out: `permissions: {}` at workflow level, `contents: read` on its
one job, same shape as `deploy.yml`'s `build` job.

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
| Raw pulse | `--pulse` | `#F75E1A` | 3.0:1 | Button *fills* and rules only, never text on cream |
| Borders / muted UI | `--slate` | `#C2D1D8` | 1.5:1 | Decorative only |

Dark mode (ink becomes the page, via `prefers-color-scheme`): links lighten to `#6EC9E8`
(7.2:1 on ink), accents to `#FF9F6B` (6.7:1 on ink). Body text uses `--cream-dim` (`#E5E5E1`,
10.72:1 on ink) rather than raw `--cream`, and muted text uses `--cream-muted` (`#B5BDBE`,
7.09:1 on ink) — both dimmed below light mode's 12.9:1 body figure on purpose: the same ratio
emitted from a dark screen reads as glare, not just contrast. The home hero's scrim opacity
rises to 0.86 in dark mode (from 0.72 in light) for the same reason — dimming the text alone
would have dropped the worst composited pixel under the 6.5:1 floor `/styleguide/` states. All
four dark-mode tints are derived from the brand bases — do not introduce new hues.

**"Never hardcode a hex value" has a pattern of exception, not a single one:** a hex literal
is tolerated outside `tokens.css` only where a `var()` genuinely cannot reach — a `<img src>`/
`<link>`-referenced file, or a caption printing a value rather than styling with it — and only
where a test reads `tokens.css` at test time and fails the suite on drift. Two instances exist
today.

The first is the three brand SVGs in `public/brand/` (`technoise-icon.svg`,
`technoise-logo-presentation.svg`, `technoise-logo-full.svg`) plus the two-file favicon,
`public/favicon.svg` and `public/favicon-dark.svg` (see the repo layout section below for why
the favicon is two files). They're referenced by `<img src>` / `<link>` URL, not inlined, so
they cannot read this page's CSS custom properties — each file carries its own fills as
literal hex, three classes (`.tn-ink`, `.tn-signal`, `.tn-pulse`) that must byte-match
`--ink`/`--signal`/`--pulse` in light mode and `--cream-dim`/`--signal-300`/`--pulse-300` in
dark — **`--cream-dim`, not raw `--cream`**: the brand wordmark used to burn at `--cream`'s
12.91:1 in dark mode while every other piece of chrome on the page was already dimmed to
`--cream-dim`'s 10.72:1, and it now takes the same value for the same reason `--text` does
(cream emitted from a dark screen reads as glare, not extra contrast). Four of the five files
gate the dark triple behind a `prefers-color-scheme: dark` override; `favicon-dark.svg` states
it unconditionally, with no media query of its own. `tests/brand-assets.test.ts` reads
`tokens.css` at test time and asserts the match — that test, not a code review, is what keeps
this exception honest. Don't "fix" the hardcoded hex in these files without re-running it; a
token edit that isn't mirrored here silently desyncs to an ink-on-ink wordmark in dark mode
(measured 1.00:1 — invisible, not just off-color).

The second is `src/lib/palette.ts`, the module behind `/styleguide/`'s swatch captions. A
caption prints a hex string and a computed WCAG ratio; neither can be a `var()`, so the
module hand-declares each base's hex and each semantic token's base per scheme, and derives
every ratio at build time rather than storing one. `tests/palette-tokens.test.ts` plays the
same role here that `tests/brand-assets.test.ts` plays for the SVGs: it reads `tokens.css`
and fails on any drift between it and the module, in either direction.

`tests/brand-assets.test.ts` carries a third standing guard, alongside the hex-token-sync rule
above and the ink-to-viewBox-height floor from Issue #22: **`public/` may hold no file that
`src/` references nowhere.** It enumerates `public/` recursively, the same shape
`tests/workflow-permissions.test.ts` uses for `.github/workflows/`, so a file dropped in later
inherits the rule instead of escaping it — this is what caught the four orphaned PNGs in
Issue #32. The one documented exception is `technoise-icon.svg`: it is the master the favicon
is exported from, served live but named nowhere in `src/`, and a second assertion holds the
exemption list to files `BRAND_FILES` already guards, so it cannot grow to cover an
undocumented path.

`tests/brand-assets.test.ts` carries a fourth guard, of a different shape than the three
above: **`Header.astro`'s inlined brand mark holds no hex of its own — it fills `.tn-ink`/
`.tn-signal`/`.tn-pulse` with `var(--ink)`/`var(--signal)`/`var(--pulse)` (and their dark
counterparts) straight from `tokens.css` — but that duplicates, as `var()` names rather than
hex, the same class-to-colour pairs the three brand SVGs above still hand-declare as literal
hex for every URL-referenced consumer.** One suite resolves each of `Header.astro`'s `fill:
var(--…)` rules through `tokens.css` and asserts the result equals the presentation file's own
declared pair, in both the light rules and every dark-scheme grouping, so a token edit, a
re-export, or a `var()` swapped for its neighbour in `Header.astro` surfaces as a failing test
rather than a wrong-hued or ink-on-ink mark. A second suite walks every built page's injected
`.site-header__brand` markup and asserts it ships both inert (no `<script>`, handler or
external reference) and still tokenised (no hex, no `fill`/`stroke` presentation attribute) —
because a re-export that moved a fill from a class onto a presentation attribute would still
be a valid, inert SVG and would still pass every geometry check, while painting a hardcoded
colour on every page in both schemes.

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
   illustration* — home hero, About, and 404 only (`src/assets/technoise-background.png` for
   the home hero, `src/assets/technoise-404-background.png` for `/404.html`, and anything like
   them stays confined to those three pages). It does not apply to the mascot as
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
breakpoint to reason about. It carries four responsibilities: `Header.astro`'s nav collapse,
`Footer.astro`'s inner grid (a two-row `1fr auto` at and above the hinge — brand and the nav
run share row one, the colophon spans row two — not three columns; below it, a single-column
grid), `Footer.astro`'s nav axis (a stacked column of full-width, block-display links below
the hinge; one horizontal `flex-direction: row` run with `inline-block` links above it — the
inversion exists because the three-column layout could not hold a horizontal five-link run
plus the colophon at 768px without both wrapping badly), and each component's own brand-logo
swap — but the two components no longer implement that last responsibility the same way.
`Footer.astro` still swaps its lockup via a `<picture><source media="(min-width: 48em)">` HTML
attribute, as both components did since `7e3924d`. `Header.astro` now inlines both lockups
(see the hex-exception section above) and swaps them with a `@media (min-width: 48em)` CSS
block over its `[data-mark="stacked"]`/`[data-mark="wide"]` elements instead, so a future
change to the breakpoint value has to be made in a CSS media query in `Header.astro` and
`tokens.css`, *and*, separately, in the footer's own `@media (min-width: 48em)` grid/nav-axis
block, *and*, separately again, the HTML `media` attribute on the footer's `<picture><source>`
— three CSS sites plus one HTML attribute, not one shared value. `tests/brand-assets.test.ts`
pins the footer's `<source media>` value to `48em`; it carries no equivalent pin for the
header's or the footer's CSS-side values today.

### Component inventory

Build once, reuse everywhere:

Header · Footer · PostCard · ProjectCard · TagPill · Prose block · CodeBlock with copy
button · Callout · Pagination · Breadcrumb · ThemeToggle · SEO head block · OG image template

If a page needs a thirteenth component, question the page before adding it.

**ThemeToggle has a prerequisite that is now half-satisfied, not probably-satisfied.**
`Header.astro`'s brand mark no longer depends on this at all: it inlines both lockups and
paints their fills through the same `tokens.css` cascade as every other page element (see the
hex-exception section above), so a `data-theme` attribute on the document reaches it exactly
the way it reaches body text — no propagation into a referenced image document required.
`Footer.astro` still references the brand SVGs by URL, so its dark-mode fills still follow
only the mechanism described below, and it is the remaining half of this prerequisite.

In principle, referencing by URL means the footer's dark-mode fills follow only the OS
`prefers-color-scheme` — a `data-theme` attribute lives on the embedding document, not inside
the referenced image, so it looks like it cannot reach in. In practice, `tokens.css` already
pairs every scheme block with a `color-scheme` declaration (`:root[data-theme="dark"] {
color-scheme: dark }`), and Chromium propagates the embedding document's *used*
`color-scheme` into a URL-referenced SVG image — so `data-theme="dark"` with the OS in light
mode correctly recolors the footer logo today. **Verified in Chromium 141 only.** Gecko and
WebKit are unverified (neither is installed in this environment), and a dark mode implemented
by filter/colour inversion rather than `color-scheme` — a Dark Reader-style browser extension,
say — sets nothing the image document can see and would still produce an invisible, ink-on-ink
footer wordmark, the same failure the header has already shed. Whoever builds ThemeToggle must
confirm this propagation across the browsers the site actually needs to support before relying
on it for the footer; where it doesn't hold, `Header.astro` is now the pattern to follow —
inline the SVGs so page-level `data-theme` CSS can target their classes — rather than serving
scheme-specific files swapped by `data-theme`.

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
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO = 100 — this floor is for
  indexable pages. `/404.html` scores SEO 69 by design: `is-crawlable` fails on its
  deliberate `noindex`, and that is correct, not a defect to fix by removing it.
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
- **`sharp` is a declared `devDependency`, not redundant with Astro.** It has two consumers:
  Astro's default `astro:assets` image service (the `<Picture>` calls in `index.astro` and
  `404.astro`) and `tests/brand-assets.test.ts`, which imports it directly to rasterise the
  brand SVGs for the Issue #22 ink-floor guard. Before Issue #31 it was only present as
  astro's *optional* transitive, so an Astro release inside `^7.3.2` that changed image
  service would have dropped it and taken the whole brand-asset suite down as a vitest
  *collection* error — a broken-harness message, not a brand regression. Its range tracks
  astro's own `optionalDependencies.sharp` so the build and the test resolve one copy; bump
  the two together, and don't tidy the declaration back out. `tests/dependency-contract.test.ts`
  is what makes the range-matching rule binding — the same role `tests/brand-assets.test.ts`
  plays for the brand-SVG hex exception and `tests/workflow-permissions.test.ts` plays for the
  deploy-workflow rules: the coupling holds because a test goes red, not because a reviewer
  remembers to check.
- `astro.config.mjs` carries a Shiki transformer that strips Shiki's own inline colours from
  fenced code blocks so `prose.css` — not Shiki's theme — styles them, and keeps the
  `tabindex="0"` Astro puts on the resulting `<pre>` (required for a scrolling region to be
  keyboard-reachable). Don't reintroduce a Shiki theme or `markdown.syntaxHighlight: false`
  without accounting for both.
- **Route-scoped stylesheets are imported by the page that needs them, not by `BaseLayout` or
  a shared component.** `src/styles/print.css` is the first of these, and the repo's first
  `@media print` rules — imported only by `src/pages/resume.astro`, so the rules ship on that
  route alone. It carries no token reset, and needs none: `tokens.css` scopes both dark-scheme
  blocks to `@media screen`, so a reader whose OS is dark already gets the light tokens under
  `@media print` without anything print-side asking for them. A reset would have been inert
  even before that scoping existed to rely on — media queries add no specificity, so a bare
  `@media print { :root { … } }` loses to `:root:not([data-theme="light"])` regardless of
  which stylesheet a bundler emits last. Keep any future dark-scheme rule scoped to
  `@media screen`; `tests/build-output.test.ts`'s "the dark scheme stays off the printed page"
  suite now enforces this by scanning every shipped CSS rule, not just convention.

### Page SEO

Every page renders through `BaseLayout`, which feeds `<SeoHead>` (the inventory's SEO head
block) and owns nothing else a crawler or social client reads. A page passes:

- `title`, `description` — required. `title` is the full `<title>` text (callers append
  `SITE.titleSuffix` via `pageTitle()` from `src/lib/seo.ts`; the home page alone stays
  bare). `description` doubles as the card summary and the meta description.
- `canonicalPath?` — omit it and the layout derives one from the page's own URL via
  `canonicalPath(Astro.url)`, so a new route is canonical by default, not by remembering.
- `noindex?` — emits `noindex, nofollow` instead of the default
  `index, follow, max-image-preview:large`. Two pages use it, and both are the only routes
  absent from `STATIC_SITEMAP_ROUTES`, for different reasons: `/styleguide/` is real content
  nobody searched for; `/404.html` is not content at all and a static host cannot pair it with
  a real 404 status code, so an indexed `404.html` would be a soft 404. `/resume/` used to
  share both while it was a stub; lifting `noindex` and adding the route was the one-line
  change that shipped once the page had real content — the pattern to repeat for any future
  stub.
- `ogType?`, `article?` — Open Graph/Twitter overrides. The card image is not a prop: every
  page shares the committed OG card (`OG_IMAGE` in `src/lib/seo.ts`).
- `prevPath?` / `nextPath?` — paginated listings only; emits `rel="prev"` / `rel="next"`.
- `schema?` — an array of JSON-LD `@graph` nodes; omitted or empty emits no `<script>` tag.

No absolute URL — canonical, `og:url`, `og:image`, JSON-LD `@id`, sitemap `<loc>`, RSS
`link`/`guid` — is ever written as a literal hostname. Every one derives from `site` in
`astro.config.mjs` through the helpers in `src/lib/seo.ts` (`absoluteUrl`, `canonicalPath`,
`pageTitle`, …). A test walks `src/` and fails the suite if a `technoise.dev` or `github.io`
literal ever appears, so changing the domain stays a one-line edit to `astro.config.mjs`.

**This site supports a root deploy only.** `site` in `astro.config.mjs` must be an origin
whose pathname is `/`, and Astro's `base` must stay unset or `/` — a project-subpath deploy
(`base: '/technoise'`, or a `site` that itself carries a path) is not supported. Every URL
`src/lib/seo.ts` builds is a rooted path resolved against `site`, and `robots.txt` must land
at the origin root or no crawler reads it, so a subpath can't be made to work by prefixing
alone. `assertRootDeploy()` in `src/lib/seo.ts`, called from `absoluteUrl()`, enforces this
at build time — a misconfigured `site` or `base` fails the build immediately with an
explicit message, rather than silently emitting wrong URLs — and `tests/seo-helpers.test.ts`
locks in both rejections. This pairs with the no-hostname-literal rule above: that rule
keeps a domain change to one line; this one constrains what that line may contain.

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
- Entries sit directly in the collection directory — `src/content/blog/<slug>.md`, never
  `src/content/blog/<dir>/<slug>.md`. The loader's `**/*.md` pattern collects nested files
  and their ids keep the directory prefix, but an id becomes a single URL segment in
  `/blog/<slug>/`, so Astro fails the build with `TypeError: Missing parameter: slug` and no
  filename. `assertRoutableId()` in `src/lib/content.ts` catches it first and names the file.
- A post's filename (its slug) may not be a bare number — it collides with the `/blog/<n>/`
  pagination routes and fails the build with the colliding filename in the error. Both this
  rule and the flat-directory one are enforced in `assertRoutableId()`, called from
  `getPublishedPosts()` and `getPublishedProjects()` — the one path every route already takes.
  Keep future slug rules there rather than adding a route-local guard.
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
