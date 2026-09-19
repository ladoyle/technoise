import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

// Why this file exists.
//
// tests/mark-tint-contract.test.ts floors --signal-300-dim at WCAG 1.4.11's 3:1 rather than
// at the 4.5:1 text minimum. That relaxation rests on two *geometric* premises, neither of
// which any other suite measured:
//
//   1. The only part of .tn-signal that touches the page surface is the "HEAR THE FUTURE"
//      logotype tagline, and at the block-size both the header and the footer pin it renders
//      as texture, not as words. SC 1.4.3 exempts logotype text from the contrast minimum at
//      any size, so this is belt-and-braces — but the *reason* the site was willing to take
//      the exemption is the rendered size, and a re-export could change it.
//   2. The face field and the headphones never abut the page at all. What governs their
//      shape-reading is the --cream-dim outline enclosing them (10.72:1 on --ink), and that
//      contrast went *up* as the fills darkened. If a re-export ever broke the outline so a
//      fill met the page directly, the 3:1-measured-on-a-surface-it-never-touches framing in
//      mark-tint-contract.test.ts would stop describing reality.
//
// Both premises lived only in a source comment and a git-ignored report. This suite measures
// them, so a re-export that enlarges the tagline or opens the outline fails here instead of
// silently invalidating a relaxed accessibility floor. Same role tests/brand-assets.test.ts
// plays for the brand-SVG hex exception: the rule holds because a test goes red.
//
// Everything is derived from the shipped sources — the SVGs, and the block-size the two
// components declare. No figure is transcribed from a report.

const root = fileURLToPath(new URL("..", import.meta.url));
const brand = join(root, "public", "brand");
const publicDir = join(root, "public");

const STACKED = join(brand, "technoise-logo-presentation.svg");
const WIDE = join(brand, "technoise-logo-full.svg");

// Files that carry no tagline: the mark alone, at favicon sizes.
const TAGLINE_FREE = [
  join(brand, "technoise-icon.svg"),
  join(publicDir, "favicon.svg"),
  join(publicDir, "favicon-dark.svg"),
];

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

/**
 * Rasterise one class out of a brand SVG at the size it actually ships at, with every other
 * class suppressed. The later .${cls} rule wins over the blanket `none`, so exactly one
 * class paints. Every drawable element in all five files carries one of the three classes,
 * so nothing leaks into the mask unclassed.
 */
const isolate = async (file: string, cls: string): Promise<{ mask: Uint8Array; width: number; height: number }> => {
  const source = readFileSync(file, "utf8");
  const viewBox = /viewBox="([^"]+)"/.exec(source);
  if (!viewBox) throw new Error(`${file} declares no viewBox`);
  const [, , vbWidth, vbHeight] = viewBox[1].trim().split(/\s+/).map(Number);

  const height = markBlockSize() * SCALE;
  const width = Math.round((height * vbWidth) / vbHeight);

  const style = `<style>.tn-ink{fill:none}.tn-signal{fill:none}.tn-pulse{fill:none}.${cls}{fill:#000}</style>`;
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

  it("the stacked lockup's tagline renders well under the texture ceiling", async () => {
    const { mask, width, height } = await isolate(STACKED, "tn-signal");
    const glyphs = taglineGlyphs(components(mask, width, height));

    expect(glyphs.length).toBeGreaterThan(0);
    for (const glyph of glyphs) {
      expect(heightInCssPx(glyph)).toBeLessThan(TEXTURE_CEILING);
    }
  });

  it("the wide lockup's tagline renders well under the texture ceiling", async () => {
    const { mask, width, height } = await isolate(WIDE, "tn-signal");
    const glyphs = taglineGlyphs(components(mask, width, height));

    expect(glyphs.length).toBeGreaterThan(0);
    for (const glyph of glyphs) {
      expect(heightInCssPx(glyph)).toBeLessThan(TEXTURE_CEILING);
    }
  });

  // Stated in mark-tint-contract.test.ts's header as a reason the non-text floor was never in
  // question for these three. If a re-export ever folded the tagline into the icon, it would
  // ship at 16px in a tab strip, where none of the reasoning above applies.
  it.each(TAGLINE_FREE)("%s carries no tagline at all", async (file) => {
    const { mask, width, height } = await isolate(file, "tn-signal");
    const shapes = components(mask, width, height);

    expect(taglineGlyphs(shapes)).toHaveLength(0);
    expect(fieldShapes(shapes)).toHaveLength(1);
  });
});

describe("the mascot's fills never meet the page directly", () => {
  // 4-neighbourhood: a fill pixel with an orthogonal neighbour that belongs to no class is
  // touching the page surface. The premise under the relaxed floor is that this is zero for
  // both fills in every file — they are read against the --cream-dim outline, not the page.
  const pageAdjacency = async (file: string, cls: string, only?: "field" | "glyphs") => {
    const [self, ink, other] = await Promise.all([
      isolate(file, cls),
      isolate(file, "tn-ink"),
      isolate(file, cls === "tn-signal" ? "tn-pulse" : "tn-signal"),
    ]);
    const { width, height } = self;

    let pixels: number[];
    if (only) {
      const shapes = components(self.mask, width, height);
      const picked = only === "field" ? fieldShapes(shapes) : taglineGlyphs(shapes);
      pixels = picked.flatMap((shape) => shape.pixels);
    } else {
      pixels = [];
      for (let i = 0; i < width * height; i += 1) if (self.mask[i]) pixels.push(i);
    }

    let boundary = 0;
    let touchingPage = 0;
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
        if (!ink.mask[next] && !other.mask[next]) touchingPage += 1;
      }
    }
    return { boundary, touchingPage };
  };

  it("the face field is fully enclosed by the outline in the stacked lockup", async () => {
    const { boundary, touchingPage } = await pageAdjacency(STACKED, "tn-signal", "field");
    expect(boundary).toBeGreaterThan(0);
    expect(touchingPage).toBe(0);
  });

  it("the face field is fully enclosed by the outline in the wide lockup", async () => {
    const { boundary, touchingPage } = await pageAdjacency(WIDE, "tn-signal", "field");
    expect(boundary).toBeGreaterThan(0);
    expect(touchingPage).toBe(0);
  });

  it.each([STACKED, WIDE, ...TAGLINE_FREE])("the headphones never meet the page in %s", async (file) => {
    const { boundary, touchingPage } = await pageAdjacency(file, "tn-pulse");
    expect(boundary).toBeGreaterThan(0);
    expect(touchingPage).toBe(0);
  });

  // The counterpart, asserted rather than assumed: the tagline *is* page-adjacent. That is
  // what makes it — and only it — the shape the 3:1-on-the-page floor is actually about.
  it("the tagline, by contrast, is read against the page", async () => {
    const { touchingPage } = await pageAdjacency(STACKED, "tn-signal", "glyphs");
    expect(touchingPage).toBeGreaterThan(0);
  });
});
