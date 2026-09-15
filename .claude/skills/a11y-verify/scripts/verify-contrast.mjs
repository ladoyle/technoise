#!/usr/bin/env node
// Real-condition accessibility/contrast verification harness for TechNoise.
// Run from a SCRATCH directory outside the repo (see ../SKILL.md for setup) —
// never inside the project, so it can't touch package.json/package-lock.json.
//
// Usage: node verify-contrast.mjs <url> [--block-fonts]
//   --block-fonts   simulate a blocked/slow webfont so fallback-font rendering
//                   (and its contrast/weight) is what actually gets checked.

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node verify-contrast.mjs <url> [--block-fonts]');
  process.exit(1);
}
const blockFonts = process.argv.includes('--block-fonts');

// Edit this list to match whatever the current checklist item touches.
const selectors = ['body', 'a', '.button', 'h1', 'h2', 'h3'];

// Fallback used only when an element's own background resolves to transparent —
// keep this in sync with --cream in src/styles/tokens.css.
const PAGE_BACKGROUND_FALLBACK = [253, 249, 243];

function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1, rgb2) {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(str) {
  const m = str?.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  return m[1].split(',').slice(0, 3).map((n) => parseFloat(n.trim()));
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
});
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);

// Simulate real browser default font sizes rather than trusting the page's own CSS.
await client.send('Page.setFontSizes', {
  fontSizes: { standard: 16, fixed: 13 },
});

if (blockFonts) {
  await page.route('**/*.woff2', (route) => route.abort());
}

await page.goto(url, { waitUntil: 'networkidle' });
await page.addScriptTag({ content: axeSource });

const results = await page.evaluate(() => window.axe.run());
console.log(`axe-core: ${results.violations.length} violations`);
for (const v of results.violations) {
  console.log(`  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`);
}

console.log('\nManual contrast spot-check:');
for (const sel of selectors) {
  const els = await page.$$(sel);
  for (const el of els.slice(0, 5)) {
    const { color, backgroundColor, fontSize, fontWeight } = await el.evaluate((e) => {
      const s = getComputedStyle(e);
      return {
        color: s.color,
        backgroundColor: s.backgroundColor,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
      };
    });
    const fg = parseRgb(color);
    let bg = parseRgb(backgroundColor);
    if (!bg || backgroundColor === 'rgba(0, 0, 0, 0)') {
      bg = PAGE_BACKGROUND_FALLBACK;
    }
    if (!fg || !bg) continue;

    const ratio = contrastRatio(fg, bg);
    const isLarge =
      parseFloat(fontSize) >= 24 ||
      (parseFloat(fontSize) >= 18.66 && parseFloat(fontWeight) >= 700);
    const min = isLarge ? 3 : 4.5;

    if (ratio < min) {
      console.log(
        `  FAIL ${sel}: ${ratio.toFixed(2)}:1 (needs ${min}:1) — ${color} on ${backgroundColor}, ${fontSize}/${fontWeight}`
      );
    }
  }
}

await browser.close();
