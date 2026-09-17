import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { contrastRatio, relativeLuminance } from "../src/lib/contrast";
import { BASES, PAGE_BASE, SWATCHES } from "../src/lib/palette";

// Issue #33. /styleguide/ renders each swatch's chip live from its token, but prints the
// hex and the WCAG ratio beside it as text — text cannot hold a var(), so the palette has
// to be spelled out a second time somewhere. That is the same unavoidable duplication the
// brand SVGs carry, and it gets the same treatment tests/brand-assets.test.ts gives them:
// read tokens.css at test time and fail on drift, because the rule holds when a test goes
// red, not when a reviewer remembers.
//
// The chain this pins runs tokens.css -> src/lib/palette.ts -> the built page:
//
//   1. every hex in BASES is the hex tokens.css declares for that base;
//   2. every swatch's base per scheme is the one tokens.css's :root and dark blocks
//      resolve that semantic token to;
//   3. every printed ratio equals the contrast, recomputed here straight out of
//      tokens.css, of that colour against its scheme's page colour;
//   4. the formula itself matches known WCAG reference pairs;
//   5. the built HTML prints exactly those strings.
//
// Only (1) and (2) are hand-declared in the module. The ratios are computed there and
// recomputed here, so a "measurement" can no longer be a figure someone typed.

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

const hexOnly = (declared: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(declared).filter(([, value]) => /^#[0-9a-f]{6}$/.test(value)));

const varsOnly = (declared: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(declared)
      .map(([name, value]) => [name, /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1]] as const)
      .filter((pair): pair is readonly [string, string] => pair[1] !== undefined),
  );

// `:root {` on its own line is the light block; the @media (min-width: 48em) copy is
// indented and carries no colour, and the dark blocks carry their own selectors.
const lightDeclared = declarations(block("\n:root {"));
const darkMedia = declarations(block(':root:not([data-theme="light"])'));
const darkAttribute = declarations(block(':root[data-theme="dark"]'));

const lightBases = hexOnly(lightDeclared);
const lightRoles = varsOnly(lightDeclared);
const darkRoles = varsOnly(darkMedia);

/** Which base a semantic token resolves to in a scheme — dark falls back to :root. */
const resolve = (token: string, scheme: "light" | "dark"): string => {
  const name = token.replace(/^--/, "");
  const base = scheme === "dark" ? (darkRoles[name] ?? lightRoles[name]) : lightRoles[name];
  if (!base) throw new Error(`tokens.css resolves no ${token} in the ${scheme} scheme`);
  return base;
};

const hexOf = (base: string): string => {
  const value = lightBases[base];
  if (!value) throw new Error(`tokens.css declares no --${base} hex`);
  return value;
};

describe("the styleguide palette mirrors tokens.css", () => {
  it("declares every base tokens.css does, and the same hex for each", () => {
    // Equality in both directions on purpose: a base added to tokens.css and not to
    // BASES is a colour the page that documents the palette does not know about.
    expect(BASES).toEqual(lightBases);
  });

  it("resolves each swatch's semantic token to the base tokens.css gives it", () => {
    for (const swatch of SWATCHES) {
      expect(swatch.bases.light, `${swatch.token} light`).toBe(resolve(swatch.token, "light"));
      expect(swatch.bases.dark, `${swatch.token} dark`).toBe(resolve(swatch.token, "dark"));
    }
  });

  it("measures each scheme against that scheme's page colour", () => {
    expect(hexOf(PAGE_BASE.light)).toBe(lightBases.cream);
    expect(hexOf(resolve("--surface", "light"))).toBe(hexOf(PAGE_BASE.light));
    expect(hexOf(resolve("--surface", "dark"))).toBe(hexOf(PAGE_BASE.dark));
  });

  it("keeps tokens.css's two dark blocks in sync, so either is a valid source", () => {
    expect(darkAttribute).toEqual(darkMedia);
  });
});

describe("the contrast formula", () => {
  it("matches WCAG reference pairs", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 6);
    // #777 on white is the canonical 4.5:1 boundary example; #767676 is the darkest grey
    // that passes AA on white, #777777 the lightest that fails.
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
  });

  it("reproduces the AAA body-text figure AGENTS.md states for ink on cream", () => {
    expect(contrastRatio("#0c3242", "#fdf9f3")).toBeCloseTo(12.91, 2);
  });

  it("is symmetric and rejects anything that is not a 6-digit hex", () => {
    expect(contrastRatio("#0c3242", "#fdf9f3")).toBe(contrastRatio("#fdf9f3", "#0c3242"));
    expect(() => contrastRatio("#fff", "#000000")).toThrow();
    expect(() => relativeLuminance("cream")).toThrow();
  });
});

describe("every printed ratio is a measurement, not a transcription", () => {
  for (const swatch of SWATCHES) {
    it(`${swatch.token}'s printed ratio recomputes from tokens.css`, () => {
      if (swatch.ratios === null) {
        expect(swatch.ratio).toBe("—");
        expect(swatch.token).toBe("--surface");
        return;
      }

      const expected = {
        light: contrastRatio(hexOf(resolve(swatch.token, "light")), hexOf(PAGE_BASE.light)),
        dark: contrastRatio(hexOf(resolve(swatch.token, "dark")), hexOf(PAGE_BASE.dark)),
      };

      const printed = [...swatch.ratio.matchAll(/(\d+\.\d+):1/g)].map((m) => m[1]);
      expect(printed.length, `${swatch.token} prints no ratio`).toBeGreaterThan(0);

      // One figure means both schemes measure the same at the printed precision; two
      // means light first, as the page's lede promises.
      const decimals = printed[0].split(".")[1].length;
      (["light", "dark"] as const).forEach((scheme, i) => {
        expect(printed[printed.length === 1 ? 0 : i], `${swatch.token} ${scheme}`).toBe(
          expected[scheme].toFixed(decimals),
        );
      });
    });
  }

  it("keeps each caption's hex byte-identical to tokens.css, case aside", () => {
    for (const swatch of SWATCHES) {
      expect(swatch.light.toLowerCase(), `${swatch.token} light caption`).toContain(
        hexOf(resolve(swatch.token, "light")),
      );
      expect(swatch.dark.toLowerCase(), `${swatch.token} dark caption`).toContain(
        hexOf(resolve(swatch.token, "dark")),
      );
    }
  });
});

describe("the built styleguide prints what the module derived", () => {
  let html = "";
  let text = "";

  beforeAll(() => {
    // dist/ is built once per run by tests/global-setup.ts.
    html = readFileSync(join(root, "dist", "styleguide", "index.html"), "utf8");
    text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  });

  for (const swatch of SWATCHES) {
    it(`renders ${swatch.token}'s caption and ratio beside its live chip`, () => {
      expect(text).toContain(`${swatch.light} / ${swatch.dark}`);
      expect(text).toContain(swatch.ratio);
      // The chip stays a var() reference, so the colour shown can never be the stale
      // half of this pair — only the caption could drift, and the assertions above
      // are what stop it.
      expect(html).toContain(`background: var(${swatch.token})`);
    });
  }
});
