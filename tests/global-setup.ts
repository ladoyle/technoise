import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Issue #18. One build, once, before any test file loads. Three suites read dist/, and
// owning the build per-suite failed both ways: building unconditionally in each raced
// two `astro build` runs over the same dist/ and node_modules/.astro, and skipping the
// build when dist/ already held HTML let a tree left behind by another branch be
// asserted against and reported green — `vitest run tests/nav-contract.test.ts` alone
// could not see the regression the suite exists to catch. A single global build removes
// both: dist/ always matches this src/, and no two workers ever write it.

const root = fileURLToPath(new URL("..", import.meta.url));

export default function setup(): void {
  try {
    execFileSync("npx", ["astro", "build"], { cwd: root, stdio: "pipe", timeout: 300_000 });
  } catch (error) {
    // A failed build now fails the whole run rather than one suite, so its output has to
    // reach the console — "globalSetup threw" with nothing under it is undiagnosable.
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    process.stderr.write(stdout?.toString() ?? "");
    process.stderr.write(stderr?.toString() ?? "");
    throw error;
  }
}
