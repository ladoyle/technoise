# Pre-SVG-migration brand rasters

These four PNGs are the original brand canvases the site shipped before the logo trace. They
are **archived, not live**: nothing in `src/`, `tests/` or `src/content/` references them, and
they are deliberately outside `public/` so no build copies them into `dist/` and no deploy
publishes them.

| File | Superseded by |
|---|---|
| `technoise-full-logo.png` | `public/brand/technoise-logo-full.svg` |
| `technoise-presentation-logo.png` | `public/brand/technoise-logo-presentation.svg` |
| `technoise-large-icon.png` | `public/brand/technoise-icon.svg` |
| `technoise-minified-icon.png` | `public/favicon.svg` / `public/favicon.ico` |

## Why they are not served

They lived in `public/brand/` until Issue #32. Astro copies `public/` verbatim into the build,
so all four were published at stable URLs on the canonical domain — 4.2 MB of a 9.8 MB deploy,
against ~43 KB for the three SVGs that replaced them. Worse, they are the *pre-fix* artwork:
`4b1d414` ("Trim brand SVG viewBoxes to their ink bounds") re-cropped the traces precisely
because these canvases carry heavy transparent margin, which is what Issue #22 reported as a
sub-pixel wordmark. Serving them offered anyone who found the URL superseded, known-defective
brand art with no way to tell it was stale.

## Why they are kept

They are source material, not a served asset — and the asset-prep table in
[`docs/setup-guide.md`](../../docs/setup-guide.md) still lists exports that have not been made
yet and name these canvases as their source: `icon-192`, `icon-512` and `apple-touch-icon` come
from `technoise-large-icon.png`, social profile images from `technoise-presentation-logo.png`.
Re-deriving those from the traced SVGs is not equivalent, so the originals stay versioned here
for regeneration and historical comparison.

Anything moved back under `public/` is deployed. If one of these is ever needed at a live URL,
export a fit-for-purpose asset from it rather than republishing the canvas — and note that
`tests/brand-assets.test.ts` fails on any file in `public/` that nothing in `src/` references.
