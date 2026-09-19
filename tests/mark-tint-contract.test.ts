import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "../src/lib/contrast";

// The brand mark's robot took --signal-300-dim / --pulse-300-dim so the dark lockup reads
// wordmark-first rather than neon. Two facts made that safe, and until this file both were
// held by a comment in tokens.css and by nothing else. Both fail silently:
//
//   1. The -dim pair is mark-only. Pointing --link, --rule, --focus or --accent-fill-hover
//      at it would drop every link, divider, focus ring and button hover on the site from
//      ~7:1 to ~4.7:1 in a one-word edit, with no page looking broken and no other suite
//      going red — tests/palette-tokens.test.ts pins the base behind each *swatched* token,
//      and --accent-fill-hover is not swatched.
//   2. Both fills sit inside a two-sided 3:1 window, and each side is measured against a
//      colour the mark is genuinely adjacent to. The face field and the headphones never abut
//      the page — tests/mark-tagline-scale.test.ts measures 0% page adjacency and ~100%
//      adjacency to the --cream-dim outline enclosing them — so the colour they are read
//      against is that outline, and 3:1 against it is a floor on how *light* they may be
//      (crossed at ~66.5% / ~66.9% along each hue's 300->700 ramp). The only page-adjacent
//      shape in the mark is the "HEAR THE FUTURE" logotype tagline, so 3:1 against --ink is a
//      ceiling on how *dark* they may go (~81.7% / ~83.7%). The shipped 75% blend sits between
//      both. An earlier cycle floored these on --ink-sunken instead, the darkest surface
//      tokens.css declares: no placement paints the mark on it (the suite below asserts that),
//      and that framing left both fills under 3:1 against the outline they actually abut —
//      2.78:1 / 2.80:1. The --ink-sunken assertion is gone rather than re-thresholded, because
//      the surface, not the number, was wrong.
//
//      Neither floor is owed. SC 1.4.3 exempts logotype text from the 4.5:1 text minimum at
//      any size — cite it alone for that; 1.4.11 carries no logotype clause, and a logo
//      escapes it by falling outside its scope. The site honours 1.4.11's 3:1 figure
//      voluntarily, and rasterising .tn-signal in isolation at the 48px block-size both
//      components pin shows why the text floor was dropped in the first place: the tagline
//      renders 2.66-2.75 CSS px of cap height stacked and 4.30-4.48 px wide — texture, not
//      words. technoise-icon.svg and both favicons carry no tagline at all.
//
// Every value is read out of tokens.css and measured with the site's own contrast helper,
// so a later tint change is judged here rather than transcribed from a report.

const root = fileURLToPath(new URL("..", import.meta.url));
const tokens = readFileSync(join(root, "src", "styles", "tokens.css"), "utf8");

/** The declarations inside one rule, found by its selector and matched brace-to-brace. */
const block = (selector: string): string => {
  const at = tokens.indexOf(selector);
  if (at < 0) throw new Error(`tokens.css carries no ${selector} rule`);
  const open = tokens.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i] === "{") depth++;
    if (tokens[i] === "}" && --depth === 0) return tokens.slice(open + 1, i);
  }
  throw new Error(`${selector} is unclosed in tokens.css`);
};

const declarations = (source: string): Record<string, string> =>
  Object.fromEntries(
    [...source.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );

/** Semantic roles only: the `--role: var(--base)` lines, mapped role -> base name. */
const roles = (source: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(declarations(source))
      .map(([name, value]) => [name, /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1]] as const)
      .filter((pair): pair is readonly [string, string] => pair[1] !== undefined),
  );

const bases = declarations(block("\n:root {"));

const hex = (name: string): string => {
  const value = bases[name];
  if (!value || !/^#[0-9a-f]{6}$/.test(value)) {
    throw new Error(`tokens.css declares no --${name} hex in its light :root block`);
  }
  return value;
};

// Both dark blocks are asserted, not just the prefers-color-scheme one: they are written
// twice on purpose (see tokens.css), so an edit can land in one and miss the other.
const darkBlocks = {
  'prefers-color-scheme: dark': roles(block(':root:not([data-theme="light"])')),
  'data-theme="dark"': roles(block(':root[data-theme="dark"]')),
};

// The mark-only pair, not every -dim name: --cream-dim is a legitimate semantic tint and
// --text resolves to it by design. Only the robot's two fills are barred from semantic use.
const MARK_ONLY = /^(signal|pulse)-300-dim$/;

describe("the dimmed mark tints stay off every semantic role", () => {
  for (const [label, declared] of Object.entries(darkBlocks)) {
    it(`${label}: no role resolves to a mark-only -dim tint`, () => {
      const dimmed = Object.entries(declared).filter(([, base]) => MARK_ONLY.test(base));
      // Named rather than counted, so the failure says which role was retargeted.
      expect(dimmed.map(([role, base]) => `--${role}: var(--${base})`)).toEqual([]);
    });

    it(`${label}: link, rule and focus stay on the undimmed --signal-300`, () => {
      expect(declared.link).toBe("signal-300");
      expect(declared.rule).toBe("signal-300");
      expect(declared.focus).toBe("signal-300");
    });

    it(`${label}: button hover stays on the undimmed --pulse-300`, () => {
      expect(declared["accent-fill-hover"]).toBe("pulse-300");
    });

    it(`${label}: those four still measure their documented ratios on the dark page`, () => {
      const page = hex(declared.surface);
      expect(page).toBe(hex("ink"));
      for (const role of ["link", "rule", "focus"] as const) {
        expect(contrastRatio(hex(declared[role]), page)).toBeGreaterThanOrEqual(7);
      }
      expect(contrastRatio(hex(declared["accent-fill-hover"]), page)).toBeGreaterThanOrEqual(6.5);
    });
  }
});

describe("the mark's dimmed tints keep the floors that set their values", () => {
  const page = hex("ink"); // the surface both placements actually paint on
  const outline = hex("cream-dim"); // the colour both enclosed fills are actually adjacent to

  // The ceiling on darkness. Only the logotype tagline is page-adjacent, so this is the
  // side of the window that shape answers to.
  it("--signal-300-dim clears 3:1 against the page the mark is painted on", () => {
    expect(contrastRatio(hex("signal-300-dim"), page)).toBeGreaterThanOrEqual(3);
  });

  it("--pulse-300-dim clears 3:1 against the page the mark is painted on", () => {
    expect(contrastRatio(hex("pulse-300-dim"), page)).toBeGreaterThanOrEqual(3);
  });

  // The floor on lightness, and the side an --ink-sunken framing left failing: at the 60%
  // blend shipped before this assertion existed, the two tints measured 2.778:1 / 2.796:1
  // against the very outline that carries the robot's shape, while clearing 3:1 on a surface
  // no placement paints. This assertion reverses at the values it replaced — that is the
  // point of it, and why the --ink-sunken one was deleted rather than re-thresholded.
  it("both clear 3:1 against the --cream-dim outline that encloses them", () => {
    expect(contrastRatio(hex("signal-300-dim"), outline)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(hex("pulse-300-dim"), outline)).toBeGreaterThanOrEqual(3);
  });

  it("each -dim tint is actually dimmer than the 300 it is named for", () => {
    for (const hue of ["signal", "pulse"] as const) {
      const dim = contrastRatio(hex(`${hue}-300-dim`), page);
      const undimmed = contrastRatio(hex(`${hue}-300`), page);
      expect(dim).toBeLessThan(undimmed);
    }
  });

  it("the wordmark stays the brightest element in the dark lockup", () => {
    // The whole point of the change: --cream-dim (.tn-ink, wordmark and outline) must
    // out-contrast both robot fills, or the hierarchy the reviewer asked for inverts.
    const wordmark = contrastRatio(hex("cream-dim"), page);
    expect(wordmark).toBeGreaterThan(contrastRatio(hex("signal-300-dim"), page));
    expect(wordmark).toBeGreaterThan(contrastRatio(hex("pulse-300-dim"), page));
  });
});

// The other half of "--ink is the page the mark is read against": the dark blocks above map
// --surface to --ink, and nothing between <body> and the mark repaints it. Written as a
// source read rather than a rendered sample so it fails at the moment a background is
// declared, not only once someone screenshots the header.
describe("the mark is painted on --ink, which is what makes that floor the real one", () => {
  const component = (name: string): string =>
    readFileSync(join(root, "src", "components", `${name}.astro`), "utf8");

  /** Innermost `selector { declarations }` pairs — a declaration block holds no braces, so
   *  this skips at-rule preludes and reaches rules nested in a media query. */
  const rules = (source: string): { selector: string; declarations: string }[] =>
    [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1].trim(),
      declarations: m[2],
    }));

  // Whole class names, so .site-header does not also match .site-header__toggle.
  const names = (selector: string, classes: readonly string[]): boolean =>
    classes.some((cls) => new RegExp(`\\.${cls}(?![\\w-])`).test(selector));

  const BETWEEN_MARK_AND_BODY = [
    "site-header",
    "site-header__inner",
    "site-header__brand",
    "site-footer",
    "site-footer__inner",
    "site-footer__brand",
  ] as const;

  // Named, not matched loosely: the toggle is a sibling control beside the mark, never
  // behind it, and it declares a transparent background to strip the UA button fill.
  const EXEMPT = ["site-header__toggle"] as const;

  it.each(["Header", "Footer"])("%s.astro paints no background behind the mark", (name) => {
    const painted = rules(component(name))
      .filter(({ declarations }) => /(^|[;{\s])background(-color)?\s*:/.test(declarations))
      .filter(({ selector }) => !names(selector, EXEMPT))
      .filter(({ selector }) => names(selector, BETWEEN_MARK_AND_BODY))
      .map(({ selector }) => selector);

    expect(painted).toEqual([]);
  });

  it("the one exemption is real and still transparent", () => {
    const toggle = rules(component("Header")).filter(
      ({ selector, declarations }) =>
        names(selector, EXEMPT) && /(^|[;{\s])background(-color)?\s*:/.test(declarations),
    );

    expect(toggle).toHaveLength(1);
    expect(toggle[0].declarations).toMatch(/background:\s*transparent\s*;/);
  });
});
