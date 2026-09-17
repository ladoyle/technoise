// WCAG 2.x relative luminance and contrast ratio, as pure functions over a 6-digit
// hex string. The formula is the same one .claude/skills/a11y-verify/scripts/
// verify-contrast.mjs measures rendered pages with — kept here in TypeScript so a
// figure the site *prints* is computed at build time rather than transcribed from a
// run of that script months ago. A printed ratio is a conformance claim; this is what
// makes it a measurement instead.

const HEX = /^#[0-9a-f]{6}$/i;

const channels = (hex: string): [number, number, number] => {
  if (!HEX.test(hex)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
};
