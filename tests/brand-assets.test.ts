import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

// The brand SVGs under public/brand/ are the one place outside tokens.css that spells
// brand colours as literal hex. It is unavoidable — an external SVG referenced by URL
// cannot read the document's custom properties — but it means a token edit desyncs the
// logos silently, in an asset no type check and no build step looks inside. These
// assertions pin that duplication to tokens.css, and pin the three geometry facts the
// header and footer CSS depends on: each file's declared width/height must match its own
// viewBox (block-size + inline-size:auto derives the rendered width from that ratio), and
// the <img> width/height attributes must match the presentation file, because those
// attributes are what reserves the box before the SVG arrives. A fourth geometry fact —
// how much of each viewBox is actually ink — is pinned further down, for Issue #22.

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
  dir: string;
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

const parseSvg = (dir: string, name: string): Svg => {
  const source = readFileSync(join(dir, name), "utf8");

  // The dark override is the only @media block in these files, so splitting on it
  // separates the default fills from the overridden ones without parsing CSS. Matched
  // by regex, not a literal substring: svgo's minifier is free to drop the whitespace
  // inside the media feature (e.g. `prefers-color-scheme:dark`) without changing what
  // the browser parses, and this assertion shouldn't care which form ships.
  const darkMedia = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/.exec(source);
  if (!darkMedia) throw new Error(`${name} carries no prefers-color-scheme: dark override`);
  const darkStart = darkMedia.index;
  const darkEnd = source.indexOf("</style>");

  const box = /viewBox="(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)"/.exec(source);
  const dim = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(source);
  if (!box || !dim) throw new Error(`${name} is missing a viewBox or root width/height`);

  return {
    name,
    dir,
    source,
    light: fillsIn(source.slice(0, darkStart)),
    dark: fillsIn(source.slice(darkStart, darkEnd)),
    viewBox: [+box[1], +box[2], +box[3], +box[4]],
    declared: [+dim[1], +dim[2]],
  };
};

const svgs: Svg[] = BRAND_FILES.map((name) => parseSvg(brandDir, name));

// favicon.svg carries the same three hardcoded-hex classes, for the same reason (a <link
// rel="icon"> URL cannot read the document's custom properties), and AGENTS.md names it in
// the same exception — but it lives one directory up, so it stayed outside the list above
// and outside every assertion here. A token edit mirrored into public/brand/ and not into
// the favicon desynced silently, which is the exact failure the exception is written to
// prevent. It is asserted alongside them now.
const tokenTracked: Svg[] = [...svgs, parseSvg(join(root, "public"), "favicon.svg")];

describe("brand SVG fills track tokens.css", () => {
  const expected = {
    light: () => ({ "tn-ink": token("ink"), "tn-signal": token("signal"), "tn-pulse": token("pulse") }),
    dark: () => ({
      "tn-ink": token("cream"),
      "tn-signal": token("signal-300"),
      "tn-pulse": token("pulse-300"),
    }),
  };

  for (const svg of tokenTracked) {
    it(`${svg.name} uses the light-mode brand bases`, () => {
      expect(svg.light).toEqual(expected.light());
    });

    it(`${svg.name} uses the dark-mode tints, so the mark never renders ink on ink`, () => {
      expect(svg.dark).toEqual(expected.dark());
    });
  }
});

describe("brand SVG geometry the component CSS relies on", () => {
  for (const svg of tokenTracked) {
    it(`${svg.name} declares a width/height matching its own viewBox`, () => {
      expect(svg.declared).toEqual([svg.viewBox[2], svg.viewBox[3]]);
    });
  }
});

// Issue #22 reported the wordmark missing from the header and footer logos while the robot
// and the tagline still read. The cause was never colour: the traced files framed the
// artwork on the original PNG canvases, so most of each viewBox was transparent margin.
// The header and footer fix block-size and let inline-size derive, so margin on the block
// axis is the axis that costs rendered size — technoise-logo-full.svg spent 63.6% of its
// viewBox height on nothing, leaving the wordmark's thin strokes sub-pixel at the 24-32px
// the components ask for, while the bolder robot and the wider-set tagline survived. 4b1d414
// re-cropped all three to their alpha bounds and fixed it; nothing stopped a re-export from
// putting the margin back. This measures the rendered alpha bounding box the same way that
// commit did, so a re-crop that reintroduces the defect fails here instead of shipping.
//
// sharp is declared in devDependencies because this file imports it directly (Issue #31) —
// it used to resolve only as Astro's optional transitive, so an Astro release that swapped
// its image service would have taken these guards down as a collection error. The range
// matches astro's own `optionalDependencies.sharp`, so the build and this test cannot
// resolve to two different copies.
const inkHeightFraction = async (dir: string, name: string): Promise<number> => {
  const { data, info } = await sharp(join(dir, name))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let first = -1;
  let last = -1;

  // Row occupancy is all the block axis needs, so stop at the first lit pixel in a row.
  // The threshold discounts antialiasing fringe, which would otherwise read as ink.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + channels - 1] > 16) {
        if (first < 0) first = y;
        last = y;
        break;
      }
    }
  }

  if (first < 0) throw new Error(`${name} rasterises to nothing`);
  return (last - first + 1) / height;
};

describe("brand SVG viewBoxes stay cropped to their ink", () => {
  // Floors sit ~5 points under what each file measures today, which is loose enough to
  // absorb rasteriser drift and tight enough that every pre-4b1d414 framing fails:
  //
  //   file                             today   before 4b1d414
  //   technoise-icon.svg               0.889   0.578
  //   technoise-logo-presentation.svg  0.883   0.720
  //   technoise-logo-full.svg          0.726   0.364
  //   favicon.svg                      0.889   0.578
  //
  // logo-full's 0.726 is the real figure for that file. AGENTS.md's "~88% ink" describes
  // the other three; the horizontal lockup kept ~14% margin per side on the block axis.
  // The figures are stable to ~0.003 across raster heights (512 and 2048) and alpha
  // thresholds (0, 16, 128), so the ~5 points of headroom is margin against a re-export,
  // not against measurement noise.
  const floors: Record<string, number> = {
    "technoise-icon.svg": 0.84,
    "technoise-logo-presentation.svg": 0.83,
    "technoise-logo-full.svg": 0.68,
    "favicon.svg": 0.84,
  };

  for (const svg of tokenTracked) {
    it(`${svg.name} spends its viewBox height on ink, not transparent margin`, async () => {
      expect(await inkHeightFraction(svg.dir, svg.name)).toBeGreaterThanOrEqual(floors[svg.name]);
    });
  }
});

const presentation = svgs.find((s) => s.name === "technoise-logo-presentation.svg")!;
const full = svgs.find((s) => s.name === "technoise-logo-full.svg")!;

// Footer.astro still renders the lockup the way both components used to: a <picture> whose
// <source>/<img> point at public/brand/ by URL. Header.astro no longer does — it inlines the
// same two files (see the suites below it) — so these three assertions are the footer's
// alone now, not a shared loop over both components.
describe("the footer brand lockup", () => {
  // The markup only. A component's frontmatter comment is free to name the very tags these
  // assertions grep for — Footer.astro's now does, explaining what the header stopped doing
  // — and a regex that reads the comment as markup fails on prose.
  const markup = footer.slice(footer.indexOf("\n---", 3) + 4);

  it("references brand files that exist", () => {
    const refs = [...markup.matchAll(/["'](\/brand\/[^"']+)["']/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(existsSync(join(root, "public", ref)), `Footer.astro points at a missing ${ref}`).toBe(true);
    }
  });

  it("reserves the box with the presentation file's intrinsic size", () => {
    const img = /<img[\s\S]*?>/.exec(markup);
    expect(img, "Footer.astro renders no <img>").not.toBeNull();
    const width = /\swidth="(\d+)"/.exec(img![0]);
    const height = /\sheight="(\d+)"/.exec(img![0]);
    expect([Number(width?.[1]), Number(height?.[1])]).toEqual(presentation.declared);
  });

  it("swaps sources on the one 48em breakpoint, not a second one", () => {
    const medias = [...markup.matchAll(/media="\(min-width:\s*([^)]+)\)"/g)].map((m) => m[1].trim());
    expect(medias.length).toBeGreaterThan(0);
    expect(new Set(medias)).toEqual(new Set(["48em"]));
    expect(tokens).toContain("@media (min-width: 48em)");
  });
});

// The header inlines both lockups instead of referencing them, because the fills of a
// URL-referenced image resolve inside that image — from its own prefers-color-scheme block,
// which a forced-dark filter or a non-Chromium engine may never evaluate, leaving the mark
// at light-mode #0c3242 on a dark --surface that is also #0c3242. Inlining moves the fills
// into the page's cascade, and that move is what these assertions guard: the duplication
// they pin is no longer hex-in-a-file against tokens.css, it is var()-in-Header.astro
// against the hex those same files still declare for every other consumer.
describe("the header's inlined brand mark", () => {
  const marks = [
    { variant: "stacked", svg: presentation },
    { variant: "wide", svg: full },
  ];

  it("reads both lockups from public/brand/ rather than restating their markup", () => {
    for (const { svg } of marks) {
      expect(
        header,
        `Header.astro no longer imports ${svg.name}; public/brand/ must stay the one source of truth`,
      ).toContain(`../../public/brand/${svg.name}?raw`);
    }
  });

  const rendered = () => readFileSync(join(root, "dist", "index.html"), "utf8");

  for (const { variant, svg } of marks) {
    it(`renders the ${variant} mark on ${svg.name}'s own viewBox, not a hand-typed one`, () => {
      const tag = new RegExp(`<svg data-mark="${variant}"[^>]*>`).exec(rendered());
      expect(tag, `the built header renders no [data-mark="${variant}"] svg`).not.toBeNull();

      const viewBox = /\sviewBox="([^"]+)"/.exec(tag![0])?.[1].trim().split(/\s+/).map(Number);
      const width = /\swidth="([\d.]+)"/.exec(tag![0])?.[1];
      const height = /\sheight="([\d.]+)"/.exec(tag![0])?.[1];

      expect(viewBox).toEqual(svg.viewBox);
      expect([Number(width), Number(height)]).toEqual([svg.viewBox[2], svg.viewBox[3]]);
    });
  }

  it("strips each file's own <style>, so nothing competes with the page's cascade", () => {
    const brand = /<a class="site-header__brand"[\s\S]*?<\/a>/.exec(rendered());
    expect(brand, "the built header renders no .site-header__brand").not.toBeNull();
    expect(brand![0]).not.toMatch(/<style/i);
    expect(brand![0]).toMatch(/class="tn-(ink|signal|pulse)"/);
  });
});

// The suite above reads index.html, and "brand SVGs stay inert assets" further down reads the
// source files. Neither covers what actually changed about the threat model: the mark is no
// longer an isolated image document, it is markup a <Fragment set:html> splices into the page
// on every route. A source file that stays inert and a build that inlines it are two claims,
// and only the second one is what a browser executes — so this walks the built pages and
// checks the injected region itself. It also pins the token rule at the one layer a var()
// cannot reach back into: a re-export that moves a fill from a class onto a presentation
// attribute would still be a valid SVG, would still pass every geometry check, and would
// paint a hardcoded hex on every page in both schemes.
describe("the header's inlined mark ships inert and tokenised on every page", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : full.endsWith(".html") ? [full] : [];
    });

  const pages = walk(join(root, "dist"));

  it("builds pages to check", () => {
    expect(pages.length).toBeGreaterThan(1);
  });

  for (const page of pages) {
    const label = relative(join(root, "dist"), page).split(sep).join(posix.sep);

    it(`/${label} injects no script, handler or external reference with the mark`, () => {
      const brand = /<a class="site-header__brand"[\s\S]*?<\/a>/.exec(readFileSync(page, "utf8"));
      expect(brand, `${label} renders no .site-header__brand`).not.toBeNull();

      // The opening <a> carries href and class legitimately; everything after it is the
      // injected SVG markup, which must carry neither.
      const injected = brand![0].slice(brand![0].indexOf(">") + 1);

      expect(injected).not.toMatch(/<(script|style|foreignObject|image|use|animate|set)\b/i);
      expect(injected).not.toMatch(/\son[a-z]+\s*=/i);
      expect(injected).not.toMatch(/(xlink:)?href\s*=/i);
      expect(injected).not.toMatch(/url\(\s*['"]?(https?:|\/\/)/i);
      expect(injected).not.toMatch(/javascript:/i);
    });

    it(`/${label} paints the mark from tokens, never a hex of its own`, () => {
      const brand = /<a class="site-header__brand"[\s\S]*?<\/a>/.exec(readFileSync(page, "utf8"));
      const injected = brand![0].slice(brand![0].indexOf(">") + 1);

      expect(injected, "a fill hex inlined into the page escapes tokens.css entirely").not.toMatch(
        /#[0-9a-fA-F]{3,8}\b/,
      );
      expect(injected).not.toMatch(/\s(fill|stroke)="(?!none\b)[^"]/i);
      expect(injected).toMatch(/class="tn-(ink|signal|pulse)"/);
    });
  }
});

// Every fill rule Header.astro writes for the inlined mark, resolved through tokens.css and
// compared against what the source SVGs declare for themselves. The two must agree in both
// schemes: this is a like-for-like reproduction of the files' own colours, so a token edit,
// a re-export, or a var() swapped for its neighbour in Header.astro all surface here rather
// than as a mark that renders in the wrong hue — or, in dark mode, in none.
describe("the header's inlined fills track the same tokens the source files do", () => {
  const style = header.replace(/\/\*[\s\S]*?\*\//g, "");

  const fillRules = [...style.matchAll(/([^{}]+)\{\s*fill:\s*var\(--([a-z0-9-]+)\)\s*;?\s*\}/g)]
    .map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), token: m[2] }))
    .filter((rule) => /\.tn-[a-z]+/.test(rule.selector));

  const fillsOf = (rules: typeof fillRules): Record<string, string> =>
    Object.fromEntries(rules.map((rule) => [/\.(tn-[a-z]+)/.exec(rule.selector)![1], token(rule.token)]));

  // A dark rule is one qualified by the document element, the shape tokens.css uses for
  // both of its own dark blocks. Grouping by that prefix rather than merging every dark
  // rule into one object is what keeps the [data-theme] twin from passing on the media
  // block's values.
  const darkGroups = new Map<string, typeof fillRules>();
  for (const rule of fillRules.filter((r) => r.selector.includes(":root"))) {
    const prefix = rule.selector.slice(0, rule.selector.indexOf(".site-header__brand")).trim();
    darkGroups.set(prefix, [...(darkGroups.get(prefix) ?? []), rule]);
  }

  it("paints the light scheme in the brand bases", () => {
    const light = fillRules.filter((rule) => !rule.selector.includes(":root"));
    expect(fillsOf(light)).toEqual(presentation.light);
  });

  it("paints every dark-scheme selector in the dark tints, so the mark is never ink on ink", () => {
    expect(darkGroups.size, "Header.astro overrides the mark's fills in no dark scheme").toBeGreaterThan(0);
    for (const [prefix, rules] of darkGroups) {
      expect(fillsOf(rules), prefix).toEqual(presentation.dark);
    }
  });

  it("keeps every dark override on screen, so the printed mark stays light", () => {
    for (const [prefix] of darkGroups) {
      const at = style.indexOf(prefix.split(" ")[0]);
      expect(style.slice(Math.max(0, at - 200), at), prefix).toMatch(/@media screen/);
    }
  });

  it("reproduces the same pairs the two source files agree on", () => {
    expect(full.light).toEqual(presentation.light);
    expect(full.dark).toEqual(presentation.dark);
  });
});

// Everything above walks a known list forward: a file this suite already names must exist and
// must hold its colours and geometry. Nothing looked the other way, so public/ could — and did
// — accumulate files nothing points at. Issue #32 found four superseded pre-SVG-migration PNGs
// there, 4.2 MB across 43% of the deploy, published at guessable URLs on the canonical domain
// for months. public/ is the directory where that can happen silently: Astro copies it verbatim
// into dist/, with none of the reference-tracking or pruning the src/assets/ pipeline applies.
// This enumerates the directory rather than a list, the same shape workflow-permissions.test.ts
// uses for .github/workflows/, so a file dropped in later inherits the rule instead of escaping
// it. The archived originals now live in archive/brand-pre-svg-migration/, outside every build.
describe("public/ ships nothing the site references nowhere", () => {
  const publicDir = join(root, "public");

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });

  // A rooted URL path is how every reference to public/ is written — `/brand/…`, `/og/…`,
  // `/fonts/…` — in markup, CSS and TS alike, so a substring search over src/ catches all
  // three without parsing any of them. Binary sources are skipped: they can hold no
  // reference, and src/assets/ carries megabyte rasters.
  const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)$/i;
  const source = walk(join(root, "src"))
    .filter((file) => !BINARY.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  const urlPath = (file: string) => `/${relative(publicDir, file).split(sep).join(posix.sep)}`;

  // technoise-icon.svg is the one served file src/ names nowhere: it is the master icon
  // that favicon.svg and favicon.ico are exported from, kept live and documented in
  // AGENTS.md as one of the three brand SVGs. It is exempt by name, not by being a brand
  // file — exempting all of BRAND_FILES would also excuse the two logo SVGs, which src/
  // does reference today, so a Header and Footer that stopped pointing at one would leave
  // it shipping at a live URL with nothing red. The allowance still cannot drift outside
  // the documented set; the assertion below is what holds it there.
  const UNREFERENCED_BY_DESIGN = ["/brand/technoise-icon.svg"];

  it("exempts only a file BRAND_FILES already guards", () => {
    const undocumented = UNREFERENCED_BY_DESIGN.filter(
      (path) => !BRAND_FILES.some((name) => path === `/brand/${name}`),
    );

    expect(
      undocumented,
      "an exemption must name a documented brand file, so it inherits the token-sync, " +
        "geometry and ink guards above rather than escaping every check at once",
    ).toEqual([]);
  });

  it("serves no file that nothing in src/ references", () => {
    const exempt = new Set(UNREFERENCED_BY_DESIGN);
    const orphans = walk(publicDir)
      .map(urlPath)
      .filter((path) => !exempt.has(path) && !source.includes(path));

    expect(
      orphans,
      "public/ is copied verbatim into dist/ and published — an unreferenced file is a live URL. " +
        "Reference it from src/, or move it outside public/ (see archive/brand-pre-svg-migration/).",
    ).toEqual([]);
  });

  it("keeps public/brand/ to exactly the brand set AGENTS.md documents", () => {
    expect(
      readdirSync(brandDir).sort(),
      "a file added to public/brand/ must join BRAND_FILES, so it inherits the token-sync, " +
        "geometry and ink guards rather than shipping unchecked",
    ).toEqual([...BRAND_FILES].sort());
  });
});

describe("brand SVGs stay inert assets", () => {
  for (const svg of tokenTracked) {
    it(`${svg.name} carries no script, external reference or event handler`, () => {
      expect(svg.source).not.toMatch(/<script/i);
      expect(svg.source).not.toMatch(/<(foreignObject|image|use)\b/i);
      expect(svg.source).not.toMatch(/\son[a-z]+\s*=/i);
      expect(svg.source).not.toMatch(/(xlink:)?href\s*=/i);
      expect(svg.source).not.toMatch(/url\(\s*['"]?https?:/i);
    });
  }
});
