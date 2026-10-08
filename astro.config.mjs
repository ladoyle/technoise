// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Shiki writes its theme onto every fenced block as inline `style` attributes — a
 * background colour and a colour per token, all raw hex from outside the palette, and
 * all of them outranking prose.css. On the cream page that lands as a dark slab.
 *
 * Stripping those attributes hands code blocks back to the tokens (sunken surface,
 * --text, the mono stack, the gutter bleed below the breakpoint) while keeping the
 * `tabindex="0"` Astro puts on the block — prose.css gives it `overflow-x: auto`, and
 * a region that scrolls has to be reachable by keyboard (WCAG 2.1.1).
 *
 * Turning highlighting off entirely would strip the tabindex with it; a rehype plugin
 * to put it back needs @astrojs/markdown-remark, which is a dependency this does not
 * need to add.
 *
 */
const stripShikiColours = {
  name: 'technoise:strip-shiki-colours',
  /** @param {{ properties: Record<string, unknown> }} node */
  pre(node) {
    delete node.properties.style;
    // The theme name would otherwise stay on the element claiming a theme that is no
    // longer applied.
    delete node.properties.class;
    node.properties.className = ['astro-code'];
  },
  /** @param {{ properties: Record<string, unknown> }} node */
  span(node) {
    delete node.properties.style;
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://technoise.dev',

  // /resume/ became /about/, and the old URL is indexed and linked from outside. GitHub
  // Pages cannot send a real 301, so Astro writes a static stub instead: a 0s
  // meta-refresh, robots noindex and a canonical at the new page, which search engines
  // treat as a permanent move.
  redirects: {
    '/resume': '/about/',
  },

  markdown: {
    shikiConfig: {
      transformers: [stripShikiColours],
    },
  },
});
