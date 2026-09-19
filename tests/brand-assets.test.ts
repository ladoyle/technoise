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
//
// The files no longer share one shape, and that difference is the whole of the
// mascot-scheme-freeze cycle. Two roles:
//
//   lockup      technoise-logo-presentation.svg, technoise-logo-full.svg — five classes.
//               The mascot (.tn-ink outline, .tn-signal face field, .tn-pulse headphones)
//               is frozen at its light hex in both schemes; only the text classes
//               (.tn-wordmark, .tn-tagline) carry a dark override.
//   mascot-only technoise-icon.svg, favicon.svg — three classes, no text, and no @media
//               at any scheme. Nothing in them adapts.
//
// The freeze is implemented by *absence* — the mascot classes simply have no dark rule —
// so every assertion about it below is written as a positive claim about what the dark
// block may name, never as a loop over the rules that happen to be present. A loop passes
// whether or not a mascot rule came back.

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
  /** The raw text of the file's own dark @media body, or "" when it carries none. */
  darkBlock: string;
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

const geometryOf = (name: string, source: string) => {
  const box = /viewBox="(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)"/.exec(source);
  const dim = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(source);
  if (!box || !dim) throw new Error(`${name} is missing a viewBox or root width/height`);

  return {
    viewBox: [+box[1], +box[2], +box[3], +box[4]] as [number, number, number, number],
    declared: [+dim[1], +dim[2]] as [number, number],
  };
};

// A dark @media block is optional, not required. Two of the four tracked files carry no
// text and so have nothing left that adapts — demanding one threw at module scope and took
// the whole suite (geometry, ink floor, orphan guard, inertness) down as a collection error
// rather than failing the one claim that changed. Whether a file *should* carry a dark
// block is the per-role expectation's business, asserted below, not the parser's.
const parseSvg = (dir: string, name: string): Svg => {
  const source = readFileSync(join(dir, name), "utf8");
  const style = /<style>([\s\S]*?)<\/style>/.exec(source);
  if (!style) throw new Error(`${name} carries no <style>`);

  // The dark override is the only @media block in these files, so splitting on it
  // separates the default fills from the overridden ones without parsing CSS. Matched
  // by regex, not a literal substring: svgo's minifier is free to drop the whitespace
  // inside the media feature (e.g. `prefers-color-scheme:dark`) without changing what
  // the browser parses, and this assertion shouldn't care which form ships.
  const darkMedia = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/.exec(style[1]);
  const darkStart = darkMedia?.index ?? style[1].length;

  return {
    name,
    dir,
    source,
    light: fillsIn(style[1].slice(0, darkStart)),
    dark: fillsIn(style[1].slice(darkStart)),
    darkBlock: style[1].slice(darkStart),
    ...geometryOf(name, source),
  };
};

const svgs: Svg[] = BRAND_FILES.map((name) => parseSvg(brandDir, name));

// favicon.svg carries the same three hardcoded-hex classes, for the same reason (a <link
// rel="icon"> URL cannot read the document's custom properties), and AGENTS.md names it in
// the same exception — but it lives one directory up, so it stayed outside the list above
// and outside every assertion here. A token edit mirrored into public/brand/ and not into
// the favicon desynced silently, which is the exact failure the exception is written to
// prevent. It is asserted alongside them now.
const favicon = parseSvg(join(root, "public"), "favicon.svg");
const tokenTracked: Svg[] = [...svgs, favicon];

const MASCOT_CLASSES = ["tn-ink", "tn-signal", "tn-pulse"] as const;
const TEXT_CLASSES = ["tn-wordmark", "tn-tagline"] as const;

// Which role each tracked file plays. Written as a list rather than inferred from the
// file's own contents, so a lockup that lost its text classes fails here instead of being
// re-classified as a mascot-only file and passing.
const LOCKUPS = ["technoise-logo-presentation.svg", "technoise-logo-full.svg"];
const isLockup = (svg: Svg) => LOCKUPS.includes(svg.name);

// --text resolves to --cream-dim rather than raw --cream in dark because cream emitted from
// a dark screen reads as glare, and the wordmark takes the same value for the same reason.
// --signal-300-dim is the tagline's, and only the tagline's: it is --signal-300 walked 75%
// toward --signal-700, deliberately *not* --signal-300 itself, which remains the link, rule,
// focus and hover tint — do not unify these back. Read from tokens.css, never written as a
// literal, so a token edit still fails here.
//
// The mascot triple has no dark half at all. `dark` is asserted as an exact object, so
// "empty" is a claim this suite makes rather than a loop it skips.
const expected = {
  lockupLight: () => ({
    "tn-ink": token("ink"),
    "tn-signal": token("signal"),
    "tn-pulse": token("pulse"),
    "tn-wordmark": token("ink"),
    "tn-tagline": token("signal"),
  }),
  lockupDark: () => ({
    "tn-wordmark": token("cream-dim"),
    "tn-tagline": token("signal-300-dim"),
  }),
  mascotLight: () => ({
    "tn-ink": token("ink"),
    "tn-signal": token("signal"),
    "tn-pulse": token("pulse"),
  }),
};

describe("brand SVG fills track tokens.css", () => {
  for (const svg of tokenTracked) {
    it(`${svg.name} uses the light-mode brand bases`, () => {
      expect(svg.light).toEqual(isLockup(svg) ? expected.lockupLight() : expected.mascotLight());
    });
  }

  for (const svg of tokenTracked.filter(isLockup)) {
    it(`${svg.name} adapts its wordmark and tagline in dark, and nothing else`, () => {
      expect(svg.dark).toEqual(expected.lockupDark());
    });

    // The freeze itself, asserted on the raw block rather than on parsed fills: a
    // `.tn-signal{fill:none}` or a var() the fill parser skips would still be a dark rule
    // for a class that must have none.
    it(`${svg.name} names no mascot class anywhere in its dark block`, () => {
      for (const cls of MASCOT_CLASSES) {
        expect(
          svg.darkBlock,
          `${cls} is frozen at its light fill in both schemes — a dark rule for it undoes that`,
        ).not.toMatch(new RegExp(`\\.${cls}(?![\\w-])`));
      }
    });
  }

  for (const svg of tokenTracked.filter((s) => !isLockup(s))) {
    it(`${svg.name} carries no scheme override at all`, () => {
      expect(svg.dark).toEqual({});
      expect(svg.source, `${svg.name} carries no text, so nothing in it adapts`).not.toMatch(/@media/i);
      for (const cls of TEXT_CLASSES) {
        expect(svg.source).not.toContain(cls);
      }
    });
  }
});

// One icon, one rendering. The two-file/two-link arrangement that preceded this existed to
// switch between a light and a dark rendering of the same mark; freezing the mascot left it
// with nothing to switch, and public/favicon-dark.svg was deleted rather than kept as a
// byte-identical decoy. Note what still guards a re-added copy: the orphan-file suite below
// fails on any file in public/ that src/ references nowhere, so a favicon-dark.svg that came
// back without a link goes red there, and one that came back *with* a link goes red here.
describe("the one-file favicon", () => {
  it("ships no dark-only sibling", () => {
    expect(existsSync(join(root, "public", "favicon-dark.svg"))).toBe(false);
  });

  it("renders the same in both schemes, with no internal query to re-evaluate", () => {
    expect(favicon.source).not.toMatch(/@media/i);
  });
});

// The document side. Every built page, not just index.html: the links live in BaseLayout, so
// a route that bypassed it would be invisible to a single-file check.
describe("BaseLayout ships one scheme-invariant icon set", () => {
  const walkHtml = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walkHtml(full) : full.endsWith(".html") ? [full] : [];
    });

  const pages = walkHtml(join(root, "dist"));
  const iconsOn = (page: string) =>
    [...readFileSync(page, "utf8").matchAll(/<link[^>]+rel="icon"[^>]*>/g)].map((m) => m[0]);

  const href = (tag: string) => /href="([^"]+)"/.exec(tag)?.[1];
  const media = (tag: string) => /media="([^"]+)"/.exec(tag)?.[1];

  it("builds pages to check", () => {
    expect(pages.length).toBeGreaterThan(1);
  });

  for (const page of pages) {
    const label = relative(join(root, "dist"), page).split(sep).join(posix.sep);

    it(`/${label} links the raster fallback and exactly one SVG`, () => {
      const icons = iconsOn(page);
      expect(icons.map(href)).toEqual(["/favicon.ico", "/favicon.svg"]);
      expect(icons[1]).toContain('type="image/svg+xml"');
    });

    // The specific regression a leftover attribute would cause: with
    // media="(prefers-color-scheme: light)" still on the one SVG link, a dark-OS browser
    // matches no SVG icon and silently downgrades to the .ico.
    it(`/${label} puts no media attribute on any icon link`, () => {
      expect(iconsOn(page).map(media)).toEqual([undefined, undefined]);
    });
  }

  it("points every icon at a file that ships", () => {
    for (const tag of iconsOn(join(root, "dist", "index.html"))) {
      const file = href(tag)!;
      expect(existsSync(join(root, "public", file)), `BaseLayout points at a missing ${file}`).toBe(true);
    }
  });
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

// Footer.astro now renders the lockup the way Header.astro does: both files read at build
// time and inlined, so the fills resolve in the page's cascade rather than inside a
// URL-referenced image document. These three assertions are the footer's half of that,
// pinned the same way the header's are below.
describe("the footer brand lockup", () => {
  // The markup only, for the geometry and breakpoint claims. A component's frontmatter
  // comment is free to name the very tags these assertions grep for, and a regex that reads
  // the comment as markup fails on prose.
  const markup = footer.slice(footer.indexOf("\n---", 3) + 4);

  it("references brand files that exist", () => {
    for (const svg of [presentation, full]) {
      expect(
        footer,
        `Footer.astro no longer imports ${svg.name}; public/brand/ must stay the one source of truth`,
      ).toContain(`../../public/brand/${svg.name}?raw`);
      expect(
        existsSync(join(brandDir, svg.name)),
        `Footer.astro points at a missing ${svg.name}`,
      ).toBe(true);
    }
  });

  it("reserves the box with each lockup file's intrinsic size", () => {
    const rendered = readFileSync(join(root, "dist", "index.html"), "utf8");
    const brand = /<div class="site-footer__brand"[\s\S]*?<\/div>/.exec(rendered);
    expect(brand, "the built footer renders no .site-footer__brand").not.toBeNull();

    for (const { variant, svg } of [
      { variant: "stacked", svg: presentation },
      { variant: "wide", svg: full },
    ]) {
      const tag = new RegExp(`<svg data-mark="${variant}"[^>]*>`).exec(brand![0]);
      expect(tag, `the built footer renders no [data-mark="${variant}"] svg`).not.toBeNull();

      const viewBox = /\sviewBox="([^"]+)"/.exec(tag![0])?.[1].trim().split(/\s+/).map(Number);
      const width = /\swidth="([\d.]+)"/.exec(tag![0])?.[1];
      const height = /\sheight="([\d.]+)"/.exec(tag![0])?.[1];

      expect(viewBox).toEqual(svg.viewBox);
      expect([Number(width), Number(height)]).toEqual(svg.declared);
    }
  });

  it("swaps lockups on the one 48em breakpoint, not a second one", () => {
    const swaps = [...markup.matchAll(/\[data-mark="(stacked|wide)"\]\s*\{\s*display:\s*(\w+)/g)];
    expect(swaps.length, "Footer.astro swaps the two lockups nowhere in CSS").toBeGreaterThan(0);

    const widths = [...markup.matchAll(/@media\s*\(\s*min-width:\s*([^)]+)\)/g)].map((m) => m[1].trim());
    expect(new Set(widths)).toEqual(new Set(["48em"]));
    expect(markup, "a max-width query is a second breakpoint").not.toMatch(/max-width:/);
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

  // The split is what lets the text adapt while the mascot stays frozen, and it lives in
  // the source SVGs' path markup — nothing else in this suite would notice a rebuild that
  // shipped the pre-split files, since their fills, geometry and inertness are unchanged.
  it("ships both halves of the split: all five classes reach every rendered lockup", () => {
    const brand = /<a class="site-header__brand"[\s\S]*?<\/a>/.exec(rendered())![0];
    for (const variant of ["stacked", "wide"]) {
      const mark = new RegExp(`<svg data-mark="${variant}"[\\s\\S]*?</svg>`).exec(brand);
      expect(mark, `the built header renders no [data-mark="${variant}"] svg`).not.toBeNull();
      for (const cls of [...MASCOT_CLASSES, ...TEXT_CLASSES]) {
        expect(mark![0], `${variant} lockup paints nothing with .${cls}`).toContain(`class="${cls}"`);
      }
    }
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
//
// Both placements are walked, not only the header's. Once Footer.astro stopped referencing
// the files by URL it became a second <Fragment set:html> site with the same threat model,
// and a re-export only has to reach one of them to ship a hardcoded fill on every page.
const MARK_PLACEMENTS = [
  { name: "header", region: /<a class="site-header__brand"[\s\S]*?<\/a>/, cls: "site-header__brand" },
  { name: "footer", region: /<div class="site-footer__brand"[\s\S]*?<\/div>/, cls: "site-footer__brand" },
] as const;

for (const placement of MARK_PLACEMENTS) {
  describe(`the ${placement.name}'s inlined mark ships inert and tokenised on every page`, () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : full.endsWith(".html") ? [full] : [];
      });

    const pages = walk(join(root, "dist"));

    // Each region is captured non-greedily to its own closing tag, which is the whole lockup
    // only for as long as neither wrapper gains a nested element of the same name. Asserting
    // both marks landed inside turns that brittleness into a loud failure rather than a
    // region that silently shrinks and leaves the checks below inspecting nothing.
    const injectedOf = (page: string, label: string): string => {
      const brand = placement.region.exec(readFileSync(page, "utf8"));
      expect(brand, `${label} renders no .${placement.cls}`).not.toBeNull();
      for (const variant of ["stacked", "wide"]) {
        expect(
          brand![0],
          `${label}'s .${placement.cls} captured no [data-mark="${variant}"]`,
        ).toContain(`<svg data-mark="${variant}"`);
      }

      // The opening tag carries href and class legitimately; everything after it is the
      // injected SVG markup, which must carry neither.
      return brand![0].slice(brand![0].indexOf(">") + 1);
    };

    it("builds pages to check", () => {
      expect(pages.length).toBeGreaterThan(1);
    });

    for (const page of pages) {
      const label = relative(join(root, "dist"), page).split(sep).join(posix.sep);

      it(`/${label} injects no script, handler or external reference with the mark`, () => {
        const injected = injectedOf(page, label);

        expect(injected).not.toMatch(/<(script|style|foreignObject|image|use|animate|set)\b/i);
        expect(injected).not.toMatch(/\son[a-z]+\s*=/i);
        expect(injected).not.toMatch(/(xlink:)?href\s*=/i);
        expect(injected).not.toMatch(/url\(\s*['"]?(https?:|\/\/)/i);
        expect(injected).not.toMatch(/javascript:/i);
      });

      it(`/${label} paints the mark from tokens, never a hex of its own`, () => {
        const injected = injectedOf(page, label);

        expect(
          injected,
          "a fill hex inlined into the page escapes tokens.css entirely",
        ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(injected).not.toMatch(/\s(fill|stroke)="(?!none\b)[^"]/i);
        expect(injected).toMatch(/class="tn-(ink|signal|pulse|wordmark|tagline)"/);
      });
    }
  });
}

// Every fill rule a component writes for its inlined mark, resolved through tokens.css and
// compared against what the source SVGs declare for themselves. The two must agree in both
// schemes: this is a like-for-like reproduction of the files' own colours, so a token edit,
// a re-export, or a var() swapped for its neighbour all surface here rather than as a mark
// that renders in the wrong hue — or, in dark mode, in none.
//
// Both components are checked, because both now paint their own mark through the page
// cascade. Footer.astro's five pairs are not a copy free to drift: until it was covered
// here, a dark rule naming .tn-ink under .site-footer__brand unfroze that mascot with every
// suite green — the disagree-on-one-page failure the freeze exists to prevent.
for (const [placement, componentSource, brandClass] of [
  ["header", header, ".site-header__brand"],
  ["footer", footer, ".site-footer__brand"],
] as const) {
describe(`the ${placement}'s inlined fills track the same tokens the source files do`, () => {
  const style = componentSource.replace(/\/\*[\s\S]*?\*\//g, "");

  const fillRules = [...style.matchAll(/([^{}]+)\{\s*fill:\s*var\(--([a-z0-9-]+)\)\s*;?\s*\}/g)]
    .map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), token: m[2] }))
    .filter((rule) => /\.tn-[a-z]+/.test(rule.selector));

  const fillsOf = (rules: typeof fillRules): Record<string, string> =>
    Object.fromEntries(rules.map((rule) => [/\.(tn-[a-z]+)/.exec(rule.selector)![1], token(rule.token)]));

  // Every rule in the component that targets a mark class under a dark-scheme selector,
  // whatever it declares. fillRules above only sees `fill: var(--…)`, so it cannot speak to
  // the absence the freeze is made of — this can.
  const darkMarkRules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), declarations: m[2] }))
    .filter((rule) => /\.tn-[a-z]+/.test(rule.selector) && rule.selector.includes(":root"));

  // A dark rule is one qualified by the document element, the shape tokens.css uses for
  // both of its own dark blocks. Grouping by that prefix rather than merging every dark
  // rule into one object is what keeps the [data-theme] twin from passing on the media
  // block's values.
  const darkGroups = new Map<string, typeof fillRules>();
  for (const rule of fillRules.filter((r) => r.selector.includes(":root"))) {
    const prefix = rule.selector.slice(0, rule.selector.indexOf(brandClass)).trim();
    darkGroups.set(prefix, [...(darkGroups.get(prefix) ?? []), rule]);
  }

  // Anchoring is what keeps the two components' rules from reaching each other's mark, and
  // it is the premise the grouping above relies on to find a prefix at all.
  it("anchors every mark fill at its own component's brand wrapper", () => {
    const strays = fillRules.filter((rule) => !rule.selector.includes(brandClass));
    expect(
      strays.map((rule) => rule.selector),
      `a ${placement} mark fill is not scoped to ${brandClass}`,
    ).toEqual([]);
  });

  it("paints the light scheme in the brand bases, all five classes", () => {
    const light = fillRules.filter((rule) => !rule.selector.includes(":root"));
    expect(fillsOf(light)).toEqual(presentation.light);
  });

  it("paints every dark-scheme selector in the text tints, so the wordmark is never ink on ink", () => {
    expect(
      darkGroups.size,
      `the ${placement} overrides the mark's fills in no dark scheme`,
    ).toBeGreaterThan(0);
    for (const [prefix, rules] of darkGroups) {
      expect(fillsOf(rules), prefix).toEqual(presentation.dark);
    }
  });

  // The other half of the same claim, and the one a passing loop cannot make: the mascot
  // classes must appear in *no* dark rule. Inlined, they resolve through the page cascade,
  // so a dark rule in either component unfreezes that component's mascot while the other
  // stays frozen, and the two disagree on one page.
  it("gives the mascot classes no dark rule at all, which is what freezes them", () => {
    const frozen = darkMarkRules.filter((rule) =>
      MASCOT_CLASSES.some((cls) => new RegExp(`\\.${cls}(?![\\w-])`).test(rule.selector)),
    );

    expect(
      frozen.map((rule) => `${rule.selector} {${rule.declarations.trim()}}`),
      "the mascot is frozen at its light fills in both schemes — see the note in Header.astro",
    ).toEqual([]);
  });

  it("scopes every dark mark rule to one of the two text classes", () => {
    const targeted = darkMarkRules.map((rule) => /\.(tn-[a-z-]+)/.exec(rule.selector)![1]);
    expect(new Set(targeted)).toEqual(new Set(TEXT_CLASSES));
  });

  it("keeps every dark override on screen, so the printed mark stays light", () => {
    for (const [prefix] of darkGroups) {
      const at = style.indexOf(prefix.split(" ")[0]);
      expect(style.slice(Math.max(0, at - 200), at), prefix).toMatch(/@media screen/);
    }
  });

});
}

// A property of the source files rather than of either component, so it is asserted once,
// outside the loop above: both lockups must agree on the pairs both components reproduce.
describe("the two lockup files agree on the pairs both components reproduce", () => {
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

  // /CNAME is GitHub Pages' own custom-domain config, read by GitHub's serving
  // infrastructure, not by src/. A site built and deployed via a GitHub Actions workflow
  // (this repo's deploy.yml, not "Deploy from a branch") has to carry the file itself — see
  // docs/infrastructure.md. It's a deploy artifact, not a brand asset, so it stays out of
  // BRAND_FILES/UNREFERENCED_BY_DESIGN rather than stretching that guard's meaning.
  const DEPLOY_FILES_BY_DESIGN = ["/CNAME"];

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
    const exempt = new Set([...UNREFERENCED_BY_DESIGN, ...DEPLOY_FILES_BY_DESIGN]);
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
