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
//   2. .tn-signal is not a decorative fill. It paints the "HEAR THE FUTURE" tagline as well
//      as the robot's face field (verified by rendering the class in isolation out of both
//      lockups), so its dark tint carries text-as-image and is floored at the 4.5:1 text
//      minimum, not at WCAG 1.4.11's 3:1 non-text one. .tn-pulse paints the headphone band
//      and cups only — shapes, no text — and takes the 3:1 floor.
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
  const page = hex("ink");
  const sunken = hex("ink-sunken");

  it("--signal-300-dim clears 4.5:1, because .tn-signal paints the tagline", () => {
    expect(contrastRatio(hex("signal-300-dim"), page)).toBeGreaterThanOrEqual(4.5);
  });

  it("--pulse-300-dim clears the 3:1 non-text floor", () => {
    expect(contrastRatio(hex("pulse-300-dim"), page)).toBeGreaterThanOrEqual(3);
  });

  it("both clear 3:1 on the darkest surface the site has", () => {
    expect(contrastRatio(hex("signal-300-dim"), sunken)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(hex("pulse-300-dim"), sunken)).toBeGreaterThanOrEqual(3);
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
