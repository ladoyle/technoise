import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

// Why this file exists.
//
// tests/mark-tint-contract.test.ts floors --signal-300-dim — the "HEAR THE FUTURE" logotype
// tagline's dark fill, and after the mascot-scheme-freeze cycle the mark's only dark fill
// besides the wordmark — at WCAG 1.4.11's 3:1 rather than at the 4.5:1 text minimum, and
// floors it against --ink. Both halves of that are *geometric* claims, and no other suite
// measures them:
//
//   1. The tagline renders as texture, not as words, at the block-size both the header and
//      the footer pin. SC 1.4.3 exempts logotype text from the contrast minimum at any size,
//      so this is belt-and-braces — but the *reason* the site was willing to take the
//      exemption is the rendered size, and a re-export could change it.
//   2. The tagline is page-adjacent, and the mascot's fills are not. Every boundary pixel the
//      tagline has meets the page; every boundary pixel the face field and the headphones
//      have meets the .tn-ink outline that encloses them. That is what makes --ink the right
//      surface to floor the tagline against, and it is the whole of why the mascot's own
//      frozen fills are read against the page directly.
//
// One thing measured here inverted its meaning in the freeze cycle without changing its
// value. The enclosure figure — ~100% of each mascot fill's boundary meets .tn-ink — used to
// prove those fills were read against a *--cream-dim* outline, which is what set a floor on
// how light they could be. There is no cream outline in dark mode any more: .tn-ink is frozen
// at the page colour, so the enclosure now proves the opposite-facing fact, that the fills
// are surrounded by something indistinguishable from the page and are therefore read against
// the page at 3.143:1 and 4.238:1. Same measurement, opposite conclusion — do not read the
// number as a lightness floor any more.
//
// Everything is derived from the shipped sources — the SVGs, and the block-size the two
// components declare. No figure is transcribed from a report.

const root = fileURLToPath(new URL("..", import.meta.url));
const brand = join(root, "public", "brand");
const publicDir = join(root, "public");

const STACKED = join(brand, "technoise-logo-presentation.svg");
const WIDE = join(brand, "technoise-logo-full.svg");

// Files that carry no tagline: the mark alone, at favicon sizes.
const TAGLINE_FREE = [join(brand, "technoise-icon.svg"), join(publicDir, "favicon.svg")];

// Supersample factor. Every figure below is reported in CSS px after dividing by it.
const SCALE = 24;

const cssPixel = (value: number): number => value / SCALE;

/** The rendered block-size, in CSS px, that both brand placements pin. */
const markBlockSize = (): number => {
  const tokens = readFileSync(join(root, "src", "styles", "tokens.css"), "utf8");
  const space48 = /--space-48:\s*([0-9.]+)rem\s*;/.exec(tokens);
  if (!space48) throw new Error("--space-48 is no longer declared in rem");
  return Number(space48[1]) * 16;
};

type Component = { minX: number; maxX: number; minY: number; maxY: number; pixels: number[] };

/** Every tn- class the file actually paints with, read off its own markup. */
const classesIn = (source: string): string[] => [
  ...new Set([...source.matchAll(/class="(tn-[a-z-]+)"/g)].map((m) => m[1])),
];

/**
 * Rasterise one class out of a brand SVG at the size it actually ships at, with every other
 * class suppressed. The later .${cls} rule wins over the blanket `none`, so exactly one
 * class paints.
 *
 * The suppression list is derived from the file, never hardcoded. It was a hardcoded triple
 * until the lockups grew .tn-wordmark and .tn-tagline, at which point the two new classes
 * matched no rule in the replacement <style>, fell back to SVG's default fill — black — and
 * painted into every mask this helper produced. That failure mode is the dangerous one for
 * this suite: an enclosure or adjacency figure measured against a polluted mask is a wrong
 * number, not a red test. Deriving the list means a sixth class inherits the suppression
 * instead of silently joining the measurement.
 */
const isolate = async (file: string, cls: string): Promise<{ mask: Uint8Array; width: number; height: number }> => {
  const source = readFileSync(file, "utf8");
  const viewBox = /viewBox="([^"]+)"/.exec(source);
  if (!viewBox) throw new Error(`${file} declares no viewBox`);
  const [, , vbWidth, vbHeight] = viewBox[1].trim().split(/\s+/).map(Number);

  const height = markBlockSize() * SCALE;
  const width = Math.round((height * vbWidth) / vbHeight);

  const painted = classesIn(source);
  const suppressed = painted.map((name) => `.${name}{fill:none}`).join("");
  const style = `<style>${suppressed}.${cls}{fill:#000}</style>`;
  const isolated = source.replace(/<style>[\s\S]*?<\/style>/, style);

  const { data, info } = await sharp(Buffer.from(isolated))
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    mask[i] = data[i * info.channels + info.channels - 1] > 128 ? 1 : 0;
  }
  return { mask, width, height };
};

/** 8-connected components, so each glyph and each field comes back as one shape. */
const components = (mask: Uint8Array, width: number, height: number): Component[] => {
  const label = new Int32Array(width * height).fill(-1);
  const found: Component[] = [];
  const stack: number[] = [];

  for (let seed = 0; seed < width * height; seed += 1) {
    if (!mask[seed] || label[seed] >= 0) continue;
    const id = found.length;
    const shape: Component = { minX: Infinity, maxX: -1, minY: Infinity, maxY: -1, pixels: [] };
    found.push(shape);
    label[seed] = id;
    stack.push(seed);

    while (stack.length) {
      const at = stack.pop() as number;
      const x = at % width;
      const y = Math.floor(at / width);
      shape.pixels.push(at);
      if (x < shape.minX) shape.minX = x;
      if (x > shape.maxX) shape.maxX = x;
      if (y < shape.minY) shape.minY = y;
      if (y > shape.maxY) shape.maxY = y;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && label[next] < 0) {
            label[next] = id;
            stack.push(next);
          }
        }
      }
    }
  }
  return found;
};

const heightInCssPx = (shape: Component): number => cssPixel(shape.maxY - shape.minY + 1);

// The face field is an order of magnitude taller than a tagline glyph in both lockups
// (17.9px vs 2.7px stacked, 21.5px vs 4.3px wide), so any split in that gap separates them.
const FIELD_VS_GLYPH_SPLIT = 10;

const taglineGlyphs = (shapes: Component[]): Component[] =>
  shapes.filter((shape) => heightInCssPx(shape) < FIELD_VS_GLYPH_SPLIT);

const fieldShapes = (shapes: Component[]): Component[] =>
  shapes.filter((shape) => heightInCssPx(shape) >= FIELD_VS_GLYPH_SPLIT);

describe("the logotype tagline stays texture at the size the mark ships at", () => {
  // Both .site-header__brand [data-mark] and .site-footer__brand img pin
  // `block-size: var(--space-48)`. Everything below is measured at that height, so if the
  // components ever pin a different one the premise has to be re-argued, not re-used.
  it("both brand placements still pin block-size: var(--space-48)", () => {
    for (const component of ["Header.astro", "Footer.astro"]) {
      const source = readFileSync(join(root, "src", "components", component), "utf8");
      expect(source).toMatch(/block-size:\s*var\(--space-48\)/);
    }
    expect(markBlockSize()).toBe(48);
  });

  // The ceiling is generous on purpose: measured today the glyphs are 2.71-2.75 CSS px
  // (stacked) and 4.29-4.42 (wide). 6px leaves room for rasteriser drift while still failing
  // any re-export that scaled the tagline up enough to make it read as words — which is the
  // point at which the 4.5:1 text floor mark-tint-contract.test.ts dropped would be owed a
  // fresh argument rather than inherited.
  const TEXTURE_CEILING = 6;

  // Measured on .tn-tagline, which *is* the glyphs. Before the split the tagline shared
  // .tn-signal with the face field and had to be separated out of the mask by height, so the
  // FIELD_VS_GLYPH_SPLIT heuristic decided what the ceiling applied to. Now the class decides,
  // and every shape in the mask is in scope — a glyph that grew past the split would have
  // quietly left the old measurement rather than failing it.
  it.each([
    ["stacked", STACKED],
    ["wide", WIDE],
  ])("the %s lockup's tagline renders well under the texture ceiling", async (_label, file) => {
    const { mask, width, height } = await isolate(file, "tn-tagline");
    const shapes = components(mask, width, height);

    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(heightInCssPx(shape)).toBeLessThan(TEXTURE_CEILING);
    }
  });

  // Stated in mark-tint-contract.test.ts's header as a reason the non-text floor was never in
  // question for these two. If a re-export ever folded the tagline into the icon, it would
  // ship at 16px in a tab strip, where none of the reasoning above applies. Asserted on the
  // class rather than on a raster: after the split, "carries no tagline" is exactly "declares
  // no .tn-tagline", which is both stronger and cheaper than measuring shapes.
  it.each(TAGLINE_FREE)("%s carries no tagline at all", async (file) => {
    const source = readFileSync(file, "utf8");
    expect(classesIn(source)).toEqual(["tn-ink", "tn-signal", "tn-pulse"]);
    expect(source).not.toContain("tn-tagline");

    // …and .tn-signal in these files is the face field alone, with no glyph-scale shape
    // beside it. This is what would catch a tagline re-added under the old shared class.
    const { mask, width, height } = await isolate(file, "tn-signal");
    const shapes = components(mask, width, height);
    expect(taglineGlyphs(shapes)).toHaveLength(0);
    expect(fieldShapes(shapes)).toHaveLength(1);
  });

  // The helper below suppresses every class the file names. An element carrying none would
  // take SVG's default fill — black — and paint into every mask, which is how a wrong number
  // gets produced instead of a red test.
  it.each([STACKED, WIDE, ...TAGLINE_FREE])("%s paints nothing unclassed", (file) => {
    const source = readFileSync(file, "utf8");
    const drawn = [...source.matchAll(/<(path|circle|rect|ellipse|polygon|polyline|line)\b[^>]*>/g)];

    expect(drawn.length).toBeGreaterThan(0);
    for (const [element] of drawn) {
      expect(element, "every drawable element must carry a tn- class").toMatch(/class="tn-[a-z-]+"/);
    }
  });
});

describe("what each fill is actually adjacent to", () => {
  // 4-neighbourhood: a fill pixel with an orthogonal neighbour that belongs to no class is
  // touching the page surface; one whose neighbour carries .tn-ink is touching the outline.
  // Every *other* class the file paints is subtracted too, and as a set rather than as one
  // named sibling — with five classes in the lockups, "the other one" is no longer a single
  // file-wide answer, and a neighbour left out of the set would be miscounted as page.
  const pageAdjacency = async (file: string, cls: string) => {
    const painted = classesIn(readFileSync(file, "utf8"));
    const self = await isolate(file, cls);
    const ink = await isolate(file, "tn-ink");
    const others = [];
    for (const name of painted) {
      if (name === cls || name === "tn-ink") continue;
      others.push(await isolate(file, name));
    }
    const { width, height } = self;

    const pixels: number[] = [];
    for (let i = 0; i < width * height; i += 1) if (self.mask[i]) pixels.push(i);
    expect(pixels.length, `${cls} paints nothing in ${file}`).toBeGreaterThan(0);

    let boundary = 0;
    let touchingPage = 0;
    let touchingInk = 0;
    for (const at of pixels) {
      const x = at % width;
      const y = Math.floor(at / width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          boundary += 1;
          touchingPage += 1;
          continue;
        }
        const next = ny * width + nx;
        if (self.mask[next]) continue;
        boundary += 1;
        if (cls !== "tn-ink" && ink.mask[next]) touchingInk += 1;
        else if (!others.some((other) => other.mask[next])) touchingPage += 1;
      }
    }
    return { boundary, touchingPage, touchingInk };
  };

  // The fraction of a fill's boundary that meets .tn-ink. 1.00 today for both fills in every
  // file; the 0.99 allowance is for rasteriser drift along an antialiased edge, not for a
  // region of open outline. Read it as "the mascot's coloured fills never touch the page" —
  // which, with .tn-ink frozen at the page colour in dark mode, is why they are nonetheless
  // read against --ink at 3.143:1 and 4.238:1.
  const ENCLOSURE = 0.99;

  it.each([
    ["stacked", STACKED],
    ["wide", WIDE],
  ])("the %s lockup's face field is wholly enclosed by the outline", async (_label, file) => {
    const { boundary, touchingPage, touchingInk } = await pageAdjacency(file, "tn-signal");
    expect(boundary).toBeGreaterThan(0);
    expect(touchingPage).toBe(0);
    expect(touchingInk / boundary).toBeGreaterThanOrEqual(ENCLOSURE);
  });

  it.each([STACKED, WIDE, ...TAGLINE_FREE])("the headphones never meet the page in %s", async (file) => {
    const { boundary, touchingPage, touchingInk } = await pageAdjacency(file, "tn-pulse");
    expect(boundary).toBeGreaterThan(0);
    expect(touchingPage).toBe(0);
    expect(touchingInk / boundary).toBeGreaterThanOrEqual(ENCLOSURE);
  });

  // The counterpart, and the premise the tagline's whole floor rests on: .tn-tagline meets
  // the page on its entire boundary and the outline on none of it. Asserted in both
  // directions — "greater than zero" would also pass for a tagline that had crept inside the
  // outline on most of its perimeter, which would put it against a colour the floor is not
  // measured for.
  it.each([
    ["stacked", STACKED],
    ["wide", WIDE],
  ])("the %s lockup's tagline is read against the page, and only the page", async (_label, file) => {
    const { boundary, touchingPage, touchingInk } = await pageAdjacency(file, "tn-tagline");
    expect(boundary).toBeGreaterThan(0);
    expect(touchingInk).toBe(0);
    expect(touchingPage / boundary).toBeGreaterThanOrEqual(ENCLOSURE);
  });
});
