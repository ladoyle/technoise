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
import { PNG } from 'pngjs';

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

// When an element's own background resolves to transparent, it isn't necessarily sitting
// on the flat page color — it may be over a photo, a gradient, or another element's
// background-image. Trusting PAGE_BACKGROUND_FALLBACK in that case can report a confident
// wrong answer (this is exactly how a mascot-image hero passed a contrast check it should
// have failed). Instead, screenshot the real composite behind the element and sample it.
async function sampleRenderedBackground(page, el) {
  // boundingBox() reports viewport-relative coordinates, and so does a screenshot clip —
  // so the element has to actually be inside the viewport before either is meaningful.
  // Un-scrolled, a below-the-fold element (the footer, on most pages) yields a box whose
  // y sits past the viewport's bottom edge and page.screenshot throws on the clip.
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box || box.width < 2 || box.height < 2) return null;

  // Hide the element's own text ink first so the sample lands on the composite behind
  // it, not on anti-aliased glyph pixels. Restored unconditionally below.
  const prevColor = await el.evaluate((e) => {
    const prev = e.style.color;
    e.style.color = 'transparent';
    return prev;
  });

  let buffer;
  try {
    // Inset from the edges to avoid border/outline/shadow bleed at the element's boundary.
    const inset = Math.min(4, box.width / 4, box.height / 4);
    const clip = {
      x: box.x + inset,
      y: box.y + inset,
      width: Math.max(1, Math.round(box.width - inset * 2)),
      height: Math.max(1, Math.round(box.height - inset * 2)),
    };
    // Viewport screenshot on purpose: `fullPage: true` would reinterpret this clip in
    // document coordinates and silently sample the top of the page instead of the element.
    buffer = await page.screenshot({ clip });
  } finally {
    await el.evaluate((e, prev) => {
      e.style.color = prev;
    }, prevColor);
  }

  const png = PNG.sync.read(buffer);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    r += png.data[i];
    g += png.data[i + 1];
    b += png.data[i + 2];
    n++;
  }
  if (n === 0) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
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
    let bgSource = 'computed';
    if (!bg || backgroundColor === 'rgba(0, 0, 0, 0)') {
      const sampled = await sampleRenderedBackground(page, el);
      if (sampled) {
        bg = sampled;
        bgSource = `sampled rgb(${sampled.join(', ')}) — computed style was transparent, this is the real composite`;
      } else {
        bg = PAGE_BACKGROUND_FALLBACK;
        bgSource = 'fallback — assumed flat page background, could not sample (zero-size element)';
      }
    }
    if (!fg || !bg) continue;

    const ratio = contrastRatio(fg, bg);
    const isLarge =
      parseFloat(fontSize) >= 24 ||
      (parseFloat(fontSize) >= 18.66 && parseFloat(fontWeight) >= 700);
    const min = isLarge ? 3 : 4.5;

    if (bgSource !== 'computed') {
      console.log(`  [bg ${bgSource}] ${sel}`);
    }
    if (ratio < min) {
      console.log(
        `  FAIL ${sel}: ${ratio.toFixed(2)}:1 (needs ${min}:1) — ${color} on ${backgroundColor}, ${fontSize}/${fontWeight}`
      );
    }
  }
}

await browser.close();
