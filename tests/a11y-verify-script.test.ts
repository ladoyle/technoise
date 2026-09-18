import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Issue #43: sampleRenderedBackground() reads an element's boundingBox — viewport-relative —
// and clips a screenshot to it. The two only agree while the screenshot is a plain viewport
// capture: `fullPage: true` reinterprets the same clip in document coordinates, so the sample
// silently lands at the top of the document (mascot art, on / and /404.html) while still being
// reported as "the real composite". The scroll is the other half — without it a below-the-fold
// element's box sits past the viewport's bottom edge and page.screenshot throws, taking the
// whole run down.
//
// Neither half is reachable from `astro check`, the build, or any other suite: this file is a
// skill script, not shipped code. These assertions are the only thing that keeps the pair from
// regressing, the same role tests/workflow-permissions.test.ts plays for the deploy workflow.

const root = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = join(root, ".claude/skills/a11y-verify/scripts/verify-contrast.mjs");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const source = readFileSync(scriptPath, "utf8");
const code = stripComments(source);

function sampleFunctionBody(): string {
  const start = code.indexOf("async function sampleRenderedBackground");
  expect(start, "sampleRenderedBackground() should still exist in verify-contrast.mjs").toBeGreaterThan(-1);
  const end = code.indexOf("\n}", start);
  return code.slice(start, end);
}

describe("a11y-verify's background sampler keeps its two coordinate-space invariants", () => {
  it("takes a viewport screenshot, never a fullPage one, when clipping to a boundingBox", () => {
    const screenshots = [...code.matchAll(/\.screenshot\(\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)].map(
      (m) => m[1]
    );

    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]).toContain("clip");
    expect(screenshots[0]).not.toContain("fullPage");
  });

  it("scrolls the element into the viewport before reading its boundingBox", () => {
    const body = sampleFunctionBody();
    const scroll = body.indexOf("scrollIntoViewIfNeeded");
    const box = body.indexOf("boundingBox()");

    expect(scroll).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(-1);
    expect(scroll).toBeLessThan(box);
  });

  it("only attributes a null sample to a zero-size element while that is the only way to get one", () => {
    const body = sampleFunctionBody();
    const swallowsErrors = /\bcatch\b/.test(body);
    const claimsZeroSize = /could not sample \(zero-size element\)/.test(code);

    // Issue #43's last acceptance criterion: a caught screenshot error must not be reported as
    // a zero-size element. Either keep the size guard as the sole path to the fallback, or
    // reword the message — not both.
    expect(swallowsErrors && claimsZeroSize).toBe(false);
  });
});
