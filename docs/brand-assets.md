# Brand assets, the hex exception, and the mascot scheme freeze

AGENTS.md states the binding rules in one paragraph each. This file is the reasoning
behind them. Read it before editing `public/brand/*.svg`, `public/favicon.svg`,
`Header.astro`'s inlined mark, or any `-dim` token.

## Why these files carry literal hex

"Never hardcode a hex value" has a *pattern* of exception, not a single one. A hex literal
is tolerated outside `tokens.css` only where a `var()` genuinely cannot reach — an
`<img src>`/`<link>`-referenced file, or a caption printing a value rather than styling with
it — and only where a test reads `tokens.css` at test time and fails the suite on drift.

Two instances exist today.

**1. The brand SVGs.** `public/brand/technoise-icon.svg`,
`public/brand/technoise-logo-presentation.svg`, `public/brand/technoise-logo-full.svg` and
`public/favicon.svg` are referenced by URL, not inlined, so they cannot read the embedding
page's custom properties. Each file carries its own fills as literal hex.

**2. `src/lib/palette.ts`**, the module behind `/styleguide/`'s swatch captions. A caption
prints a hex string and a computed WCAG ratio; neither can be a `var()`. The module
hand-declares each base's hex and each semantic token's base per scheme, and derives every
ratio at build time rather than storing one.

`tests/brand-assets.test.ts` and `tests/palette-tokens.test.ts` read `tokens.css` at test
time and fail on drift in either direction. Those tests, not code review, are what keep the
exception honest. Don't "fix" the hardcoded hex without re-running them.

## The two file roles

- **Mascot-only** — `technoise-icon.svg` and `favicon.svg`. Three classes (`.tn-ink`,
  `.tn-signal`, `.tn-pulse`: the outline, the face field, the headphones), and **no**
  `@media (prefers-color-scheme: dark)` block at all. Every fill is the light-mode hex,
  unconditional, in both schemes.
- **Lockup** — `technoise-logo-presentation.svg` and `technoise-logo-full.svg`. Five
  classes: the same three mascot classes, frozen exactly as above, plus `.tn-wordmark`
  (the "TechNoise" letterforms) and `.tn-tagline` ("HEAR THE FUTURE"). Only `.tn-wordmark`
  and `.tn-tagline` appear in either file's dark block; the mascot classes appear in
  neither. `.tn-wordmark` must byte-match `--ink`/`--cream-dim` (light/dark).
  `.tn-tagline` must byte-match `--signal`/`--signal-300-dim`.

The split exists because the human asked the mascot to stop adapting to scheme entirely
while the wordmark and tagline kept their existing dark-mode treatment unchanged — a
request the four prior `mascot-dark-dim` cycles' shared three-class shape could not express,
since one class painted both a mascot detail and letterforms in some paths.

## The mascot renders at 1.000:1 in dark mode, on purpose

`.tn-ink` is frozen at its light-mode hex (`#0C3242`) in every file and every scheme. The
dark-mode page background is also `#0C3242` (`--ink`, dark mode's `--surface`). The outline
and the mascot's inner line-work (visor, mouth, eye surrounds) therefore vanish into the
page, measured at exactly 1.000:1.

**This is requested, shipped behaviour — not the ink-on-ink defect four prior cycles worked
to prevent.** Do not "fix" it by giving `.tn-ink` a dark value again.

`.tn-signal` (the face field) still clears 3.143:1 against `--ink` and `.tn-pulse` (the
headphones) 4.238:1, so the mascot survives as a recognisable silhouette of colour fields;
what is lost is only the drawn rim. The brand lockup is `aria-hidden` inside an
`<a aria-label>`, so nothing is conveyed to assistive tech by the vanished outline.

**The wordmark is not exempt from the old rule.** `.tn-wordmark` must still clear a real
floor (`--cream-dim`, 10.72:1), and a token edit not mirrored across every file still
silently desyncs it to the same 1.000:1 an earlier cycle shipped by accident. That failure
mode is real — just now narrowed to the two text classes rather than all three mascot ones.

## `--signal-300-dim`, the one surviving dim tint

`--signal-300-dim` (`#2386A9`) is a blend along `--signal`'s own `-300`/`-700` ramp (25% the
`-300` base, 75% the `-700` base, moved further toward `--signal-700` — not toward `--ink`,
which reads brown rather than a calmer blue). It serves `.tn-tagline` alone, at **3.260:1
against `--ink`**.

`.tn-tagline` is the only element left in either lockup that touches the page surface
directly in dark mode, so `--ink` is the only floor that applies — there is no second,
outline-based floor to reconcile against, because `.tn-ink` has no dark value left to floor.

The applicable standard is WCAG 1.4.11's **3:1 non-text minimum**, not the 4.5:1 text
minimum a prior cycle held it to: SC 1.4.3 exempts logotype text from the text floor at any
size, and the tagline renders as texture (2.7–4.4 CSS px of cap height) rather than readable
text at the size both lockups ship it.

Never a link, rule, focus or hover colour — `--signal-300`/`--pulse-300` (undimmed) remain
those, unchanged.

`--pulse-300-dim`, the tint that used to serve `.tn-pulse`'s dark fill, has no consumer left
anywhere in the repo after the freeze and was removed with it.

## What `mark-tint-contract` and `mark-tagline-scale` guard

`tests/mark-tint-contract.test.ts` reads `tokens.css` and measures with `src/lib/contrast.ts`:

1. No semantic role (`--link`/`--rule`/`--focus`/`--accent-fill-hover`) ever resolves to
   `--signal-300-dim`, in either dark block — so a future edit can't silently drop link or
   focus contrast site-wide. Plus a standing guard that **no `-dim` base may be declared in
   `tokens.css` without a `var()` consumer in `src/`**, so a reinstated `--pulse-300-dim`
   needs a real consumer from the day it lands.
2. `--signal-300-dim` is floored at 3:1 against `--ink`.
3. The frozen mascot fills are measured against the dark page and the resulting figures
   pinned — `.tn-ink` 1.000:1, `.tn-signal` 3.143:1, `.tn-pulse` 4.238:1 — with a comment
   recording that the outline's 1.000:1 is this cycle's intended result, so a future reader
   treats it as a decision to preserve rather than a bug to helpfully fix.
4. A placement-invariant check: every rule between the mark and `<body>` in `Header.astro`
   and `Footer.astro` is parsed, and any that declares a background fails (the header's
   toggle button is the one named exemption, itself pinned to `transparent`). The three
   pinned figures are only true for as long as nothing sits between the mark and the page.
   **Known gap:** that invariant is a source read of the two components only; it does not
   see `src/styles/`, a shared layout, or an inline style.

`tests/mark-tagline-scale.test.ts` measures — rather than transcribes from a report — the
geometric premises the above depends on. It pins the `block-size: var(--space-48)` anchor
both `Header.astro` and `Footer.astro` declare for the mark; rasterises the tagline glyphs
in both lockup files against a rendered-cap-height ceiling, so a re-export that scaled them
up to readable text fails here; confirms `technoise-icon.svg` and `favicon.svg` carry no
tagline class at all; and measures each mascot fill's own boundary, asserting at least 99%
of it meets `.tn-ink` — which is what turns "the face field and headphones are wholly
enclosed by the outline, so only the tagline is read against the page" from an assumption
into a per-pixel measurement. Its `isolate()` helper derives the set of classes to suppress
from each file's own class attributes rather than naming three, so a sixth class inherits
suppression instead of polluting every mask.

## Geometry: viewBox trim and the footer's hand-copied extents

`public/brand/*.svg`'s viewBoxes are trimmed close to their ink bounds — ~88% ink for
`technoise-icon.svg` (0.889) and `technoise-logo-presentation.svg` (0.883), ~73% for
`technoise-logo-full.svg` (0.726). The horizontal lockup carries more block-axis margin than
the other two, and "~88%" does not describe it.

`.site-footer__brand img` and its `<img width height>` pair (`918`/`835`, the presentation
file's own extents) assume that framing — `Footer.astro` still references the files by URL
and hand-copies their extents. **Re-exporting or re-cropping any of these files means
revisiting that pair**, or the footer's mark renders at the wrong size or off-center.

`Header.astro` no longer works this way: it inlines both lockups at build time and sizes
`.site-header__brand [data-mark]` from each file's own `viewBox`, read at import time rather
than hand-copied, so a re-export cannot desync the header's box the way it still can the
footer's.

`tests/brand-assets.test.ts` asserts the footer's declared size matches the presentation
file's own `viewBox`, asserts the header's rendered `viewBox`/`width`/`height` matches each
source file's own, and floors each file's ink-to-viewBox height fraction against the figures
above — so both a size desync and a re-crop that thins the ink back out fail the suite.

## The header's inlined mark

`Header.astro`'s inlined brand mark holds no hex of its own: it fills all five classes with
`var()` straight from `tokens.css` (`.tn-ink`/`.tn-signal`/`.tn-pulse` unconditionally;
`.tn-wordmark`/`.tn-tagline` with a dark override). That duplicates — as `var()` names
rather than hex — the same class-to-colour pairs the brand SVGs hand-declare for every
URL-referenced consumer, so `tests/brand-assets.test.ts` resolves each of the header's
`fill: var(--…)` rules through `tokens.css` and asserts the result equals the presentation
file's own declared pair, in the light rules and every dark grouping. A token edit, a
re-export, or a `var()` swapped for its neighbour surfaces as a failing test rather than a
wrong-hued or ink-on-ink mark.

A second suite walks every built page's injected `.site-header__brand` markup and asserts it
ships both inert and still tokenised — because a re-export that moved a fill from a class
onto a presentation attribute would still be a valid, inert SVG and would still pass every
geometry check, while painting a hardcoded colour on every page in both schemes.

## The favicon is two files, not three

`public/favicon.ico` and `public/favicon.svg`. `BaseLayout.astro`'s `<head>` links both, in
order: `.ico` (no `media`) → `favicon.svg` (`type="image/svg+xml"`, **no `media`
attribute**).

A third file, `favicon-dark.svg`, existed through the four `mascot-dark-dim` cycles so the
icon could switch to a dimmed-but-still-adapting rendering on a dark OS.
`mascot-scheme-freeze` deleted it: once the mascot stops adapting to scheme at all, there is
only one rendering left, and shipping the same bytes at a second URL selected by `media` is
a no-op with a maintenance cost — the deleted file would have been byte-identical to
`favicon.svg` the moment the freeze landed.

Its removal also retires two rules a prior version of this section named: the "dark before
light is load-bearing" link-ordering rule, and "`favicon.svg` keeps its internal dark
`@media` block on purpose, as a Gecko fallback." Both existed only to make a scheme *switch*
correct; there is no switch left to get wrong. If a future cycle wants a dark icon back,
re-adding one file and one link is a smaller change than keeping a decoy alive through every
cycle in between.

## ThemeToggle's remaining prerequisite

`Header.astro` no longer depends on scheme propagation at all: it inlines both lockups and
paints their fills through the same `tokens.css` cascade as every other page element, so a
`data-theme` attribute on the document reaches it exactly the way it reaches body text.

`Footer.astro` still references the brand SVGs by URL, so its dark-mode fills are the
remaining half of this prerequisite. In principle a `data-theme` attribute lives on the
embedding document, not inside the referenced image, so it cannot reach in. In practice
`tokens.css` pairs every scheme block with a `color-scheme` declaration
(`:root[data-theme="dark"] { color-scheme: dark }`), and Chromium propagates the embedding
document's *used* `color-scheme` into a URL-referenced SVG image — so `data-theme="dark"`
with the OS in light mode correctly recolors the footer logo today.

**Verified in Chromium 141 only.** Gecko and WebKit are unverified (neither is installed in
this environment), and a dark mode implemented by filter/colour inversion rather than
`color-scheme` — a Dark Reader-style extension — sets nothing the image document can see and
would still produce an invisible, ink-on-ink footer wordmark.

Whoever builds ThemeToggle must confirm this propagation across the browsers the site needs
to support. Where it doesn't hold, `Header.astro` is the pattern to follow — inline the SVGs
so page-level `data-theme` CSS can target their classes — rather than serving
scheme-specific files swapped by `data-theme`.
