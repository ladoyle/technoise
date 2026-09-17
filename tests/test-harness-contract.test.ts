import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Issue #18: three suites read dist/, and each owned its own `astro build`. Two only ran
// it when dist/ held no HTML, so a tree left behind by another branch was assertable and
// reported green; running it unconditionally in each instead raced two builds over the
// same dist/ and node_modules/.astro. The build now lives in tests/global-setup.ts and
// runs once per vitest invocation.
//
// Nothing else checks that it stays there. The two regressions these assertions exist to
// catch are a `globalSetup` entry dropped or renamed out of vitest.config.ts (every
// HTML-reading suite silently goes back to asserting whatever dist/ is on disk), and a
// future suite that shells out to `astro build` itself — which brings the race back, now
// that fileParallelism is on again.

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const testsDir = join(root, "tests");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, match);
    return match(entry.name) ? [full] : [];
  });
}

const newestMtime = (paths: string[]) => Math.max(...paths.map((p) => statSync(p).mtimeMs));

describe("the test harness builds dist/ exactly once, in globalSetup", () => {
  it("registers tests/global-setup.ts as vitest's globalSetup", () => {
    const config = stripComments(readFileSync(join(root, "vitest.config.ts"), "utf8"));
    expect(config).toMatch(/globalSetup:\s*\[\s*["']\.\/tests\/global-setup\.ts["']\s*\]/);
  });

  it("keeps the build out of every test file", () => {
    const self = fileURLToPath(import.meta.url);
    const spawnsAProcess = /from\s+["']node:child_process["']|require\(\s*["']node:child_process["']/;
    const runsAstroBuild = /["']astro["']\s*,\s*["']build["']/;

    const offenders = filesUnder(testsDir, (name) => name.endsWith(".test.ts"))
      .filter((file) => file !== self)
      .filter((file) => {
        const code = stripComments(readFileSync(file, "utf8"));
        return spawnsAProcess.test(code) || runsAstroBuild.test(code);
      })
      .map((file) => relative(root, file));

    expect(offenders, "a test file that runs its own `astro build` races the global one").toEqual([]);
  });

  it("reads a dist/ no older than the source it is asserting against", () => {
    const built = newestMtime(filesUnder(dist, (name) => name.endsWith(".html")));
    const authored = newestMtime([
      ...filesUnder(join(root, "src"), (name) => /\.(astro|ts|md|css)$/.test(name)),
      join(root, "astro.config.mjs"),
    ]);

    expect(built).toBeGreaterThanOrEqual(authored);
  });
});
