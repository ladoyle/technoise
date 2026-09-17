/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// getViteConfig, not a bare defineConfig: the helpers under test import from
// `astro:content`, which only resolves with Astro's own Vite plugins loaded.
export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The one `astro build` the HTML-reading suites share. It lives here, not in their
    // beforeAll hooks, so dist/ is built exactly once per run and always from this
    // src/ — see tests/global-setup.ts. No test file shells out to a build any more,
    // which is what `fileParallelism: false` used to guard against; the suites only
    // read dist/, so they can run in parallel again.
    globalSetup: ["./tests/global-setup.ts"],
  },
});
