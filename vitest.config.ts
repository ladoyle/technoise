/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// getViteConfig, not a bare defineConfig: the helpers under test import from
// `astro:content`, which only resolves with Astro's own Vite plugins loaded.
export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
