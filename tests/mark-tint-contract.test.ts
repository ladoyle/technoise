import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "../src/lib/contrast";

// The brand mark no longer changes colour in dark mode, except for its two text classes.
// What that leaves this file guarding is narrower than what it was written for, and the
// difference matters enough to state:
//
//   1. --signal-300-dim is still mark-only, and that is still the assertion with the widest
//      blast radius here. Pointing --link, --rule, --focus or --accent-fill-hover at it would
//      drop every link, divider, focus ring and button hover on the site from ~7:1 to ~4.7:1
//      in a one-word edit, with no page looking broken and no other suite going red —
//      tests/palette-tokens.test.ts pins the base behind each *swatched* token, and
//      --accent-fill-hover is not swatched. The pair this guarded is a single token now;
//      --pulse-300-dim went when .tn-pulse stopped having a dark fill to serve.
//   2. The one remaining dark tint has one consumer and one surface. .tn-tagline — the "HEAR
//      THE FUTURE" logotype — is the only part of the mark that still adapts, and
//      tests/mark-tagline-scale.test.ts measures it at 100% page adjacency: it touches the
//      page and nothing else. So --ink is the only colour to floor it against, at 3.260:1.
//      The two-sided window a prior cycle maintained (a --cream-dim outline floor on how
//      *light* the fills could be, a --ink ceiling on how dark) is gone with the mechanism
//      that needed it: in dark mode the outline is no longer --cream-dim, it is --ink.
//   3. The mascot's own fills are frozen at their light hex in both schemes, so they are not
//      tints to threshold any more — they are constants to measure. The suite below records
//      what they measure against the dark page, including the deliberate 1.000:1 the outline
//      renders at. That figure is the requested behaviour of this cycle, not an escaped
//      regression; it is asserted so a future reader finds it stated rather than inferred.
//
// No floor here is owed. SC 1.4.3 exempts logotype text from the 4.5:1 text minimum at any
// size — cite it alone for that; 1.4.11 carries no logotype clause, and a logo escapes it by
// falling outside its scope. The site honours 1.4.11's 3:1 figure voluntarily where a shape
// still has a colour to honour it with.
//
// Every value is read out of tokens.css or out of the shipped SVG and measured with the
// site's own contrast helper, so a later change is judged here rather than transcribed
// from a report.

const root = fileURLToPath(new URL("..", import.meta.url));
const tokens = readFileSync(join(root, "src", "styles", "tokens.css"), "utf8");

/** Every text file under a directory, read. Binary sources hold no var() and are skipped. */
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)$/i;
const walkSource = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkSource(full);
    return BINARY.test(full) ? [] : [readFileSync(full, "utf8")];
  });

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

// The mark-only tints, not every -dim name: --cream-dim is a legitimate semantic tint and
// --text resolves to it by design. Only a mark fill is barred from semantic use. The pattern
// still names pulse, though no --pulse-300-dim is declared today: if one is ever reinstated
// for a mark fill, it inherits this bar rather than needing to be remembered into it.
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

describe("the tagline tint keeps the one floor still set against a real surface", () => {
  const page = hex("ink"); // the surface the mark is painted on, and all the tagline abuts

  it("--signal-300-dim clears 3:1 against the page the tagline is read on", () => {
    expect(contrastRatio(hex("signal-300-dim"), page)).toBeGreaterThanOrEqual(3);
  });

  it("it is actually dimmer than the --signal-300 it is named for", () => {
    expect(contrastRatio(hex("signal-300-dim"), page)).toBeLessThan(
      contrastRatio(hex("signal-300"), page),
    );
  });

  it("the wordmark stays the brighter of the two things that still adapt", () => {
    expect(contrastRatio(hex("cream-dim"), page)).toBeGreaterThan(
      contrastRatio(hex("signal-300-dim"), page),
    );
  });

  // The generalised form of what retiring --pulse-300-dim did. A -dim base exists to be a
  // mark fill; one declared with nothing pointing at it is a value that drifts out of every
  // guard, since palette-tokens.test.ts only pins the base behind a *swatched* token.
  it("every -dim base declared still has a consumer in src/", () => {
    const sources = walkSource(join(root, "src"));
    const dimNames = Object.keys(bases).filter((name) => name.endsWith("-dim"));
    expect(dimNames.length).toBeGreaterThan(0);

    const unused = dimNames.filter(
      (name) => !sources.some((source) => source.includes(`var(--${name})`)),
    );
    expect(
      unused,
      "a -dim tint with no var() consumer is dead weight: give it one or retire it",
    ).toEqual([]);
  });
});

// The freeze, measured rather than described. These three fills have no dark value at all
// now, so what they are read against in dark mode is simply their light hex on --ink — and
// one of them is --ink. The 1.000:1 is the shipped, requested behaviour of the
// mascot-scheme-freeze cycle: the human was shown this figure in the design report and asked
// for it anyway. It is pinned here, with the SVG's own declared hex on one side, so that a
// future reader meets it as a recorded decision rather than as the ink-on-ink defect the
// header's own comment history describes.
describe("the frozen mascot fills, measured against the dark page", () => {
  const page = hex("ink");
  const lockup = readFileSync(
    join(root, "public", "brand", "technoise-logo-presentation.svg"),
    "utf8",
  );

  const fill = (cls: string): string => {
    const match = new RegExp(`\\.${cls}\\s*\\{\\s*fill:\\s*(#[0-9a-f]{6})\\s*\\}`).exec(lockup);
    if (!match) throw new Error(`the stacked lockup declares no ${cls} fill`);
    return match[1];
  };

  it("the outline renders at 1.000:1 — the page colour, on purpose", () => {
    expect(fill("tn-ink")).toBe(page);
    expect(contrastRatio(fill("tn-ink"), page)).toBeCloseTo(1, 3);
  });

  it("the face field and headphones still clear 1.4.11's 3:1 unaided", () => {
    expect(contrastRatio(fill("tn-signal"), page)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(fill("tn-pulse"), page)).toBeGreaterThanOrEqual(3);
  });
});

// The other half of "--ink is the page the mark is read against": the dark blocks above map
// --surface to --ink, and nothing between <body> and the mark repaints it. Written as a
// source read rather than a rendered sample so it fails at the moment a background is
// declared, not only once someone screenshots the header.
//
// What this protects changed with the freeze, though the assertion did not. It no longer
// guards a --cream-dim enclosure floor — there is no cream outline in dark mode any more. It
// guards the two figures directly above: that the frozen .tn-signal and .tn-pulse are read
// against --ink at 3.143:1 and 4.238:1, and that the tagline's 3.260:1 is measured against
// the surface it actually meets. A background introduced behind the mark makes all three
// numbers describe a colour pair that no longer occurs.
//
// Its reach is a source read of these two components only: it does not see src/styles/, a
// shared layout, or an inline style.
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
