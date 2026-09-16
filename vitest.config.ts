/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// getViteConfig, not a bare defineConfig: the helpers under test import from
// `astro:content`, which only resolves with Astro's own Vite plugins loaded.
export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // build-output and discovery-output each shell out to `astro build` in this same
    // directory. Run in parallel they race over dist/ and node_modules/.astro, and
    // one of the two builds dies — a cold `npm test` failed 2 runs in 8 here, 6 in 8
    // before the hero artwork slowed the build enough to de-synchronise them. The
    // suite is dominated by those builds either way, so serialising the files costs
    // almost nothing and makes a red result mean something.
    fileParallelism: false,
  },
});
