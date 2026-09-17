import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Issue #31 declared `sharp` in devDependencies because tests/brand-assets.test.ts imports
// it directly; before that it resolved only as astro's *optional* transitive, so an astro
// release inside ^7.3.2 that swapped image service would have taken every Issue #22 brand
// guard down as a vitest collection error. Two things have to stay true for that fix to
// keep holding, and neither is enforced by anything the type checker or the build reads:
//
//   1. The declared range must keep matching astro's own optionalDependencies.sharp. If
//      astro widens or moves its range and this file does not follow, npm stops deduping
//      and installs a second sharp under node_modules/astro/ — the build rasterises with
//      one libvips and the ink-floor guards below measure with another.
//   2. The lockfile entry must stay reachable without an optional edge. `optional: true`
//      on node_modules/sharp is exactly the pre-#31 state this fix removed.

const root = fileURLToPath(new URL("..", import.meta.url));

const json = (...parts: string[]): Record<string, never> =>
  JSON.parse(readFileSync(join(root, ...parts), "utf8"));

const pkg = json("package.json") as unknown as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const astroPkg = json("node_modules", "astro", "package.json") as unknown as {
  version: string;
  optionalDependencies?: Record<string, string>;
};

const lock = json("package-lock.json") as unknown as {
  packages: Record<string, { version?: string; optional?: boolean; devOptional?: boolean }>;
};

describe("sharp is declared, deduped, and not riding on an optional edge (Issue #31)", () => {
  it("declares sharp in devDependencies, not dependencies", () => {
    expect(pkg.devDependencies?.sharp).toBeDefined();
    expect(pkg.dependencies?.sharp).toBeUndefined();
  });

  it("pins the same range astro declares for its own image service", () => {
    const declared = pkg.devDependencies?.sharp;
    const astroRange = astroPkg.optionalDependencies?.sharp;

    expect(
      astroRange,
      `astro@${astroPkg.version} no longer declares optionalDependencies.sharp. The build may ` +
        `have moved to another rasteriser; re-decide what tests/brand-assets.test.ts should ` +
        `import before relaxing this assertion.`,
    ).toBeDefined();

    expect(
      declared,
      `package.json's devDependencies.sharp (${declared}) must track astro@${astroPkg.version}'s ` +
        `optionalDependencies.sharp (${astroRange}); bump the two together or npm resolves two ` +
        `copies of a native module.`,
    ).toBe(astroRange);
  });

  it("locks exactly one copy of sharp", () => {
    const paths = Object.keys(lock.packages).filter((p) => /(^|\/)node_modules\/sharp$/.test(p));
    expect(paths, "a nested sharp means the build and these tests rasterise with different libvips").toEqual(
      ["node_modules/sharp"],
    );
  });

  it("keeps the locked sharp entry off an optional-only edge", () => {
    const entry = lock.packages["node_modules/sharp"];
    expect(entry).toBeDefined();
    expect(
      entry.optional,
      "`optional: true` is the pre-#31 state: a plain `npm ci` is then free to omit sharp",
    ).not.toBe(true);
  });
});
