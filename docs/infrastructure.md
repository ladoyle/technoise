# Infrastructure, workflows, and layout rationale

The "why" behind the repo-layout and run-configuration rules AGENTS.md states in one line
each.

## Why `archive/` exists

`public/` does not mean "kept" — it means "deployed": anything under it is copied verbatim
into `dist/` and published at a guessable URL on the canonical origin.

`archive/brand-pre-svg-migration/` (Issue #32) holds the four pre-SVG-migration brand PNGs,
kept because `docs/setup-guide.md`'s asset-prep table still names them as source material
for exports (`icon-192`, `icon-512`, `apple-touch-icon`, social profile images) that have
not been made yet.

A file that must stay in the repo but must never be served belongs outside `public/` —
`archive/` is that place, the same way `src/assets/` is the place for a file that must be
served but only after `astro:assets` processes it.

`tests/brand-assets.test.ts` carries the standing guard: **`public/` may hold no file that
`src/` references nowhere.** It enumerates `public/` recursively, so a file dropped in later
inherits the rule instead of escaping it — this is what caught the four orphaned PNGs. The
one documented exception is `technoise-icon.svg`: it is the master the favicon is exported
from, served live but named nowhere in `src/`. A second assertion holds the exemption list
to files `BRAND_FILES` already guards, so it cannot grow to cover an undocumented path.

A second, unrelated exemption exists for the same reason: `public/CNAME` is GitHub Pages'
custom-domain file, read by GitHub's serving infrastructure rather than by anything in `src/`.
A site deployed via a GitHub Actions workflow (this repo's `deploy.yml`, not "Deploy from a
branch") has to carry that file itself — GitHub does not write it into the repository the way
the branch-based flow does. It's tracked separately, as `DEPLOY_FILES_BY_DESIGN` in
`tests/brand-assets.test.ts`, kept out of the brand-only allowance above so a Header or Footer
that stopped referencing a logo still fails loudly.

## `.github/workflows/deploy.yml` — two binding conventions

Both born from Issue #14: a `pages: write` + `id-token: write` grant sitting at workflow
level, readable by every job including one running third-party code.

1. **Permission grants live on jobs, not on the workflow.** The workflow-level block is
   `permissions: {}`; a job inherits nothing and must declare its own scopes, or it runs
   with no access at all. `build`, which runs third-party code, holds only `contents: read`.
   `pages: write` and `id-token: write` live on `deploy` alone, which runs no third-party
   action.
2. **A third-party action is pinned to a full commit SHA, with its version in a trailing
   comment** (`withastro/action@<40-char sha> # v6.1.3`), never to a mutable tag. Bumping it
   means re-resolving with `git ls-remote` and updating the SHA and the comment together.
   First-party `actions/*` refs stay on tags today; if that changes, it changes for
   `actions/checkout` and `actions/deploy-pages` in the same edit.

`tests/workflow-permissions.test.ts` is what makes both binding — the rule holds because a
test goes red, not because a reviewer remembers. It parses every file under
`.github/workflows/`, so a workflow added later inherits the rule instead of quietly
escaping it. `ci.yml` (Issue #21) was the first workflow added after this rule existed, and
it inherits it without a carve-out.

## CI reports; it does not yet gate

`.github/workflows/ci.yml` runs `npm ci`, `npx astro check` and `npm test` on every pull
request and every push to `master`. That makes CI *report* a failure, not *gate* the merge,
until the repo owner marks `verify` (the job `ci.yml` defines) as a required status check:
Settings → Branches → branch protection rule for `master` → Require status checks to pass
before merging → select `verify`.

That is a GitHub repo setting, not something in this repository, so no agent can make it.
Until it is made, a red `verify` still permits a human to merge past it.

## Why `sharp` is a declared devDependency

It has two consumers: Astro's default `astro:assets` image service (the `<Picture>` calls in
`index.astro` and `404.astro`), and `tests/brand-assets.test.ts`, which imports it directly
to rasterise the brand SVGs for the Issue #22 ink-floor guard.

Before Issue #31 it was only present as astro's *optional* transitive, so an Astro release
inside `^7.3.2` that changed image service would have dropped it and taken the whole
brand-asset suite down as a vitest *collection* error — a broken-harness message, not a
brand regression.

Its range tracks astro's own `optionalDependencies.sharp` so the build and the test resolve
one copy. Bump the two together, and don't tidy the declaration back out.
`tests/dependency-contract.test.ts` makes the range-matching rule binding and asserts the
lockfile holds exactly one `sharp`, not one marked `optional: true`.

## The `48em` hinge, and why it lives in four places

`48em` is the site's one responsive hinge, reused deliberately rather than adding a second
breakpoint to reason about. It carries four responsibilities:

1. `Header.astro`'s nav collapse.
2. `Footer.astro`'s inner grid — a two-row `1fr auto` at and above the hinge (brand and the
   nav run share row one, the colophon spans row two; not three columns); below it, a
   single-column grid.
3. `Footer.astro`'s nav axis — a stacked column of full-width, block-display links below the
   hinge; one horizontal `flex-direction: row` run with `inline-block` links above it. The
   inversion exists because the three-column layout could not hold a horizontal five-link
   run plus the colophon at 768px without both wrapping badly.
4. Each component's own brand-logo swap.

The two components no longer implement (4) the same way. `Footer.astro` still swaps its
lockup via a `<picture><source media="(min-width: 48em)">` HTML attribute. `Header.astro`
inlines both lockups and swaps them with a `@media (min-width: 48em)` CSS block over its
`[data-mark="stacked"]`/`[data-mark="wide"]` elements.

So changing the breakpoint value means editing **three CSS sites plus one HTML attribute**:
`Header.astro`'s media query, `tokens.css`, `Footer.astro`'s own
`@media (min-width: 48em)` grid/nav-axis block, and the `media` attribute on the footer's
`<picture><source>`. `tests/brand-assets.test.ts` pins the footer's `<source media>` value
to `48em`; there is no equivalent pin for the CSS-side values today.

## Route-scoped stylesheets

`src/styles/print.css` is the first of these, and the repo's first `@media print` rules —
imported only by `src/pages/resume.astro`, so the rules ship on that route alone.

It carries no token reset, and needs none: `tokens.css` scopes both dark-scheme blocks to
`@media screen`, so a reader whose OS is dark already gets the light tokens under
`@media print` without anything print-side asking for them.

A reset would have been inert even before that scoping existed to rely on — media queries
add no specificity, so a bare `@media print { :root { … } }` loses to
`:root:not([data-theme="light"])` regardless of which stylesheet a bundler emits last.

Keep any future dark-scheme rule scoped to `@media screen`. `tests/build-output.test.ts`'s
"the dark scheme stays off the printed page" suite enforces this by scanning every shipped
CSS rule, not just by convention.

## The one JS island

Astro emits zero client JS by default. Every page ships one exception: the header's mobile
nav disclosure (`html.js` class hook in `BaseLayout`, plus `Header`'s own bundled module).

It exists because `aria-expanded`/`aria-controls`, Escape-to-close and click-outside cannot
be built in HTML and CSS alone. Without JS the nav degrades to the full link list, stacked —
no broken affordance.

See AGENTS.md's accessibility floors for the standard that justifies an island, and
`Header.astro` for the only one that currently meets it.

## Shiki

`astro.config.mjs` carries a transformer that strips Shiki's own inline colours from fenced
code blocks so `prose.css` — not Shiki's theme — styles them, and keeps the `tabindex="0"`
Astro puts on the resulting `<pre>` (required for a scrolling region to be
keyboard-reachable).

Don't reintroduce a Shiki theme or `markdown.syntaxHighlight: false` without accounting for
both.
