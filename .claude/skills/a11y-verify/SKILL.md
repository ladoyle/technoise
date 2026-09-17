---
name: a11y-verify
description: Verify real-world color contrast and accessibility on TechNoise pages with Playwright + axe-core under simulated real conditions (blocked webfonts, real browser default font sizes) — catches defects that `astro check`, the production build, and Lighthouse all pass while missing. Use before any qa sign-off or gatekeeper review that touches typography, color tokens, dark mode, or button/CTA styling, and whenever a design-report checklist item changes contrast-sensitive markup.
---

# Why this exists

The stock toolchain (`astro check`, `npm run build`, Lighthouse) is necessary but not
sufficient. It has passed clean while real defects shipped: dead vertical rhythm, a
fallback font with no bold face, and a CTA that failed AA contrast once the real webfont
finished loading. Those only show up when you simulate what an actual browser does —
real default font sizes, a font that hasn't loaded yet — instead of trusting rendered
markup in isolation.

This harness runs **outside the repo**, in a scratch directory, so it never touches
`package.json` or `package-lock.json`. See [safe-install](../safe-install/SKILL.md) if
the task also needs a dependency change inside the repo.

# Setup (once per verification round)

```sh
mkdir -p "$SCRATCH_DIR/a11y-check" && cd "$SCRATCH_DIR/a11y-check"
npm init -y
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright-core axe-core pngjs
```

`pngjs` is a pure-JS PNG decoder (no native bindings) used to read screenshot pixels when the
script needs to sample a real rendered background — see "Text over an image or gradient"
below.

`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is required or the install tries to fetch a browser
build — this environment already has one.

## Finding the Chromium binary

The obvious guess (`/opt/pw-browsers/chromium/chrome-linux/chrome`) does not exist — the
path is versioned and changes between environments. Find it fresh each time rather than
hardcoding a version:

```sh
CHROME_PATH=$(find /opt/pw-browsers -maxdepth 3 -name chrome | head -1)
export CHROME_PATH
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
```

# Running against the site

Start the production preview in the background, run the check, then stop it — don't
leave a foreground server blocking the turn (same rule as the dev server in the root
CLAUDE.md):

```sh
(npm run preview > /tmp/preview.log 2>&1 &) ; sleep 4
node "$SCRATCH_DIR/a11y-check/verify-contrast.mjs" http://localhost:4321/ --block-fonts
npx astro preview stop
```

Copy [`scripts/verify-contrast.mjs`](scripts/verify-contrast.mjs) into the scratch
directory as a starting point and edit the `selectors` list and target URL for whatever
page/component the current checklist item touches. It:

- Overrides browser default font sizes via CDP (`Page.setFontSizes`) instead of trusting
  whatever the page's own CSS claims.
- Optionally blocks `*.woff2` requests (`--block-fonts`) to check fallback-font behavior —
  this is what caught the missing bold face.
- Runs axe-core for structural a11y violations.
- Does a manual per-element contrast spot-check against TechNoise's actual thresholds
  (body text 4.5:1, large text 3:1 — see the color token table in the root CLAUDE.md),
  because axe-core alone doesn't catch every case under simulated conditions.

Treat axe-core and Lighthouse as a floor, not a substitute for this — they will pass
pages that still fail the posture rules in CLAUDE.md.

## Text over an image or gradient

When an element's own `background-color` resolves to transparent, the script no longer
assumes it's sitting on the flat page color. It screenshots the real composite behind the
element (with the element's own text ink temporarily hidden, so the sample isn't polluted by
glyph anti-aliasing) and measures the actual pixels — because a transparent computed
background does not mean "the flat page background is behind this," it means "look at
whatever's actually there." A hero with a mascot image behind its heading is exactly this
case: the old flat-fallback behavior reported the heading against `--cream` regardless of
what part of the image sat behind it, which can read as a false pass over the image's
lighter regions and hide a real failure over its darker ones.

Output lines starting `[bg sampled ...]` mean the check measured a real composite, not a
flat assumption — read those closely, especially near a threshold. `[bg fallback ...]` means
sampling failed (typically a zero-size element) and the flat `--cream` assumption was used
instead, same as before this existed.

# Notes

- Rerun this after any change to `src/styles/tokens.css`, prose/link styles, button
  fills, or dark-mode media queries — those are exactly the categories that have shipped
  broken before.
- If the cream/ink/signal/pulse token values in CLAUDE.md change, update the fallback
  background color and the selector list in the script to match.
