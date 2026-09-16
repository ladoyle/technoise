import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The brand SVGs under public/brand/ are the one place outside tokens.css that spells
// brand colours as literal hex. It is unavoidable — an external SVG referenced by URL
// cannot read the document's custom properties — but it means a token edit desyncs the
// logos silently, in an asset no type check and no build step looks inside. These
// assertions pin that duplication to tokens.css, and pin the three geometry facts the
// header and footer CSS depends on: each file's declared width/height must match its own
// viewBox (block-size + inline-size:auto derives the rendered width from that ratio), and
// the <img> width/height attributes must match the presentation file, because those
// attributes are what reserves the box before the SVG arrives.

const root = fileURLToPath(new URL("..", import.meta.url));
const brandDir = join(root, "public", "brand");

const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

const tokens = read("src", "styles", "tokens.css");
const header = read("src", "components", "Header.astro");
const footer = read("src", "components", "Footer.astro");

const token = (name: string): string => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(tokens);
  if (!match) throw new Error(`tokens.css declares no --${name} hex`);
  return match[1].toLowerCase();
};

const BRAND_FILES = [
  "technoise-icon.svg",
  "technoise-logo-presentation.svg",
  "technoise-logo-full.svg",
] as const;

type Svg = {
  name: string;
  source: string;
  light: Record<string, string>;
  dark: Record<string, string>;
  viewBox: [number, number, number, number];
  declared: [number, number];
};

const fillsIn = (block: string): Record<string, string> =>
  Object.fromEntries(
    [...block.matchAll(/\.(tn-[a-z]+)\s*\{\s*fill:\s*(#[0-9a-fA-F]{6})\s*;?\s*\}/g)].map((m) => [
      m[1],
      m[2].toLowerCase(),
    ]),
  );

const svgs: Svg[] = BRAND_FILES.map((name) => {
  const source = readFileSync(join(brandDir, name), "utf8");

  // The dark override is the only @media block in these files, so splitting on it
  // separates the default fills from the overridden ones without parsing CSS.
  const darkStart = source.indexOf("@media (prefers-color-scheme: dark)");
  if (darkStart < 0) throw new Error(`${name} carries no prefers-color-scheme: dark override`);
  const darkEnd = source.indexOf("</style>");

  const box = /viewBox="(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)"/.exec(source);
  const dim = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(source);
  if (!box || !dim) throw new Error(`${name} is missing a viewBox or root width/height`);

  return {
    name,
    source,
    light: fillsIn(source.slice(0, darkStart)),
    dark: fillsIn(source.slice(darkStart, darkEnd)),
    viewBox: [+box[1], +box[2], +box[3], +box[4]],
    declared: [+dim[1], +dim[2]],
  };
});

describe("brand SVG fills track tokens.css", () => {
  const expected = {
    light: () => ({ "tn-ink": token("ink"), "tn-signal": token("signal"), "tn-pulse": token("pulse") }),
    dark: () => ({
      "tn-ink": token("cream"),
      "tn-signal": token("signal-300"),
      "tn-pulse": token("pulse-300"),
    }),
  };

  for (const svg of svgs) {
    it(`${svg.name} uses the light-mode brand bases`, () => {
      expect(svg.light).toEqual(expected.light());
    });

    it(`${svg.name} uses the dark-mode tints, so the mark never renders ink on ink`, () => {
      expect(svg.dark).toEqual(expected.dark());
    });
  }
});

describe("brand SVG geometry the component CSS relies on", () => {
  for (const svg of svgs) {
    it(`${svg.name} declares a width/height matching its own viewBox`, () => {
      expect(svg.declared).toEqual([svg.viewBox[2], svg.viewBox[3]]);
    });
  }
});

describe("the header and footer brand lockup", () => {
  const components = [
    { label: "Header.astro", source: header },
    { label: "Footer.astro", source: footer },
  ];

  const presentation = svgs.find((s) => s.name === "technoise-logo-presentation.svg")!;

  for (const { label, source } of components) {
    it(`${label} references brand files that exist`, () => {
      const refs = [...source.matchAll(/["'](\/brand\/[^"']+)["']/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(existsSync(join(root, "public", ref)), `${label} points at a missing ${ref}`).toBe(true);
      }
    });

    it(`${label} reserves the box with the presentation file's intrinsic size`, () => {
      const img = /<img[\s\S]*?>/.exec(source);
      expect(img, `${label} renders no <img>`).not.toBeNull();
      const width = /\swidth="(\d+)"/.exec(img![0]);
      const height = /\sheight="(\d+)"/.exec(img![0]);
      expect([Number(width?.[1]), Number(height?.[1])]).toEqual(presentation.declared);
    });

    it(`${label} swaps sources on the one 48em breakpoint, not a second one`, () => {
      const medias = [...source.matchAll(/media="\(min-width:\s*([^)]+)\)"/g)].map((m) => m[1].trim());
      expect(medias.length).toBeGreaterThan(0);
      expect(new Set(medias)).toEqual(new Set(["48em"]));
      expect(tokens).toContain("@media (min-width: 48em)");
    });
  }
});

describe("brand SVGs stay inert assets", () => {
  for (const svg of svgs) {
    it(`${svg.name} carries no script, external reference or event handler`, () => {
      expect(svg.source).not.toMatch(/<script/i);
      expect(svg.source).not.toMatch(/<(foreignObject|image|use)\b/i);
      expect(svg.source).not.toMatch(/\son[a-z]+\s*=/i);
      expect(svg.source).not.toMatch(/(xlink:)?href\s*=/i);
      expect(svg.source).not.toMatch(/url\(\s*['"]?https?:/i);
    });
  }
});
