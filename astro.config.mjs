// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Shiki writes its theme onto every token as an inline `style` colour, which would
 * outrank prose.css and carry hues from outside the palette. This theme's colours are
 * therefore not colours at all but `var(--code-*)` names, one per role, and the span
 * hook turns each into a `tok-*` class and drops the inline style. Markup stays
 * style-free, the role-to-token map lives in prose.css, and the values live in
 * tokens.css, so the dark scheme and print swap them like any other token.
 *
 * The `pre` hook keeps the `tabindex="0"` Astro puts on the block — prose.css gives it
 * `overflow-x: auto`, and a region that scrolls has to be reachable by keyboard
 * (WCAG 2.1.1). Turning highlighting off would strip the tabindex with it.
 *
 * The theme is written inline rather than built with shiki's createCssVariablesTheme,
 * because shiki is an undeclared transitive dependency.
 */
const technoiseTheme = {
  name: 'technoise',
  type: /** @type {const} */ ('light'),
  colors: {
    'editor.foreground': 'var(--text)',
    'editor.background': 'var(--surface-sunken)',
  },
  tokenColors: [
    {
      scope: ['keyword', 'storage.type', 'storage.modifier'],
      settings: { foreground: 'var(--code-keyword)' },
    },
    {
      scope: ['keyword.operator', 'punctuation', 'string.unquoted.argument'],
      settings: { foreground: 'var(--text)' },
    },
    {
      scope: ['string', 'constant', 'support.constant', 'punctuation.definition.string'],
      settings: { foreground: 'var(--code-literal)' },
    },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.quoted.docstring'],
      settings: { foreground: 'var(--code-comment)' },
    },
  ],
};

const tokenClasses = {
  name: 'technoise:token-classes',
  /** @param {{ properties: Record<string, unknown> }} node */
  pre(node) {
    delete node.properties.style;
    // The theme name would otherwise stay on the element as a class nothing styles.
    delete node.properties.class;
    node.properties.className = ['astro-code'];
  },
  /** @param {{ properties: Record<string, unknown> }} node */
  span(node) {
    const role = /var\(--code-(keyword|literal|comment)\)/.exec(
      String(node.properties.style ?? ''),
    )?.[1];
    delete node.properties.style;
    if (role) node.properties.className = [`tok-${role}`];
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
      theme: technoiseTheme,
      transformers: [tokenClasses],
    },
  },
});
