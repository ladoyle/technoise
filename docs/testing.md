# Test harness and suite map

Reference for `npm test`. AGENTS.md carries the binding rules; this file carries the
"why" behind each suite so the contract file stays short.

## The one build

`tests/global-setup.ts` runs `astro build` exactly once per vitest invocation, before any
test file loads. Every HTML-reading suite (`build-output`, `discovery-output`,
`nav-contract`, `brand-assets`, `palette-tokens`) only ever `readFileSync`s out of `dist/`.

**A test file must never run `astro build` itself.** `tests/test-harness-contract.test.ts`
makes this binding: it asserts `globalSetup` stays registered in `vitest.config.ts` and that
no file matching `tests/**/*.test.ts` shells out to a build. Either regression fails the
suite instead of quietly reintroducing a stale-`dist/` read or a build race.

`vitest.config.ts` no longer sets `fileParallelism: false` — the race it guarded against
(two suites each shelling out to `astro build` concurrently) no longer exists.

`globalSetup` runs once per vitest *invocation*, not per file change, so `vitest --watch`
does not get the freshness guarantee: a change to a `.astro` page won't trigger a rebuild
mid-watch-session unless a test file itself changed. Use `npm test` (run mode) when
freshness matters.

## Content loader cache

Astro's content loader caches parsed entries in `node_modules/.astro/data-store.json`, not
in `.astro/`. Deleting or renaming a file in `src/content/` and re-running `npm run build`
can still emit its page from that cache — clear it with `rm -rf node_modules/.astro`
(a plain `rm -rf .astro dist` is not enough). CI is unaffected: both workflows always
install into a clean `node_modules`.

## Suite map

16 files, 352 tests.

| Suite | Covers |
|---|---|
| `content-schema` | Frontmatter schemas in `src/content.config.ts` |
| `publishing-rules` | Draft handling, publish gating |
| `content-helpers` | Slug, date, tag, pagination, reading-time helpers |
| `seo-helpers` | `src/lib/seo.ts` — absolute URLs, canonicals, root-deploy assertion |
| `build-output` | Shipped HTML and CSS in `dist/` |
| `discovery-output` | `sitemap.xml`, `rss.xml`, `robots.txt` |
| `nav-contract` | Nav/route resolution, plus the resume privacy regression |
| `brand-assets` | The brand SVGs, the header's inlined mark, `public/` orphan guard |
| `mark-tint-contract` | Dark-mode tint roles and the frozen mascot contrast figures |
| `mark-tagline-scale` | Mark geometry, tagline cap height, per-pixel fill boundaries |
| `palette-tokens` | `src/lib/palette.ts` vs. `tokens.css`, and `/styleguide/`'s prose figures |
| `workflow-permissions` | How every `.github/workflows/` file is permitted |
| `ci-workflow` | That `ci.yml` actually runs the gates; `deploy.yml`'s node version |
| `dependency-contract` | `sharp`'s range vs. astro's own, and one lockfile copy |
| `a11y-verify-script` | `.claude/skills/a11y-verify/verify-contrast.mjs` |
| `test-harness-contract` | The one-build rule above |

## Suites that carry more than their name suggests

**`nav-contract`** also carries `/resume/`'s privacy regression assertions (see AGENTS.md's
resume rule). Its phone-shape scan strips `<svg>…</svg>` from the visible HTML first, since
the header's inlined brand mark puts viewBox coordinates on every page — including
`/resume/` — that can otherwise look phone-shaped.

**`build-output`** also carries CSS-cascade/specificity assertions for the hero ghost-CTA
hover rule; asserts every dark-scheme CSS rule in the shipped output stays `@media screen`-
scoped; and asserts the 404 page and the home hero each resolve to their own hashed art
derivatives (never the other's) and keep their own `object-position` — not only markup
checks.

**`brand-assets`** reads `dist/**/*.html` as well as the source SVGs. One suite resolves the
header's inlined-mark `var()` rules through `tokens.css` and pins them to each brand file's
own declared colours, in both schemes. Another walks every built page's injected header
markup asserting it ships inert (no script, handler or external reference) and still
tokenised (no hex, no `fill`/`stroke` presentation attribute). Every tracked file carries a
role — mascot-only or lockup, per `docs/brand-assets.md` — and both roles feed the same
geometry, ink-floor and inertness loops via one tracked list (`tokenTracked`). The lockup
role's dark block is asserted as an exact object, so "no dark override for the mascot
classes" is a positive claim rather than an absence nobody checked. A
"BaseLayout hands the scheme choice to the document" suite reads every built page, pins the
two icon links' hrefs and confirms neither carries a `media` attribute — the first assertion
in this file about the document's `<head>` rather than about an asset.

**`palette-tokens`** re-derives every ratio `/styleguide/` prints, so it carries that page's
own prose-figure assertions, not just `src/lib/palette.ts`'s.

**`ci-workflow`** pins `ci.yml`'s job name, triggers and run steps — `workflow-permissions`
asserts *how* a workflow is permitted, this one asserts that it actually *runs* the gates —
and pins `deploy.yml`'s `node-version` input against `.nvmrc`.

**`a11y-verify-script`** is the only suite covering a file under `.claude/skills/`.
`verify-contrast.mjs` is exercised by no build or check path otherwise, so this suite pins
the repo's one `page.screenshot()` call to clip-only (no `fullPage`), pins
`scrollIntoViewIfNeeded()` ahead of `boundingBox()` in `sampleRenderedBackground()`, and
asserts no `catch` there coexists with the "zero-size element" fallback message — all via
static source reads, no browser, no build.

**`mark-tint-contract`** and **`mark-tagline-scale`** are documented in
[`brand-assets.md`](brand-assets.md), since what they assert only makes sense alongside the
mascot-scheme-freeze decision.
