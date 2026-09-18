import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { RESUME } from "../src/lib/resume";

// D3/D4 turned the primary nav into a disclosure and cut /about/ from both navs for
// one reason: a nav item that promises a 404 is worse than no nav item. Nothing in the
// suite enforced that — the page count and the sitemap tests both stay green if someone
// re-adds a link to a route that was never built. These assertions cover the contract
// itself (every internal link resolves) and the ARIA wiring the disclosure depends on,
// which `astro check` cannot see because it is attribute values, not types.

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(join(dir, e.name)) : e.name.endsWith(".html") ? [join(dir, e.name)] : [],
  );
}

let pages: { path: string; html: string }[] = [];

beforeAll(() => {
  // dist/ is built once per run by tests/global-setup.ts, so what is read here always
  // matches this src/ — reusing whatever dist/ happened to be on disk reported green
  // against a tree left behind by another branch.
  pages = htmlFiles(dist).map((path) => ({ path: relative(dist, path), html: readFileSync(path, "utf8") }));
});

// Astro inlines this page's scoped styles into a single minified <style> block rather
// than a separate _astro/*.css bundle, so the print rule lives in the HTML text itself.
// Extracts the brace-balanced body of the first at-rule whose prelude (including its
// opening brace, e.g. "@media print{") appears in `css`.
function atRuleBody(css: string, prelude: string): string | null {
  const start = css.indexOf(prelude);
  if (start === -1) return null;
  const bodyStart = start + prelude.length;
  let depth = 1;
  for (let i = bodyStart; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(bodyStart, i);
    }
  }
  return null;
}

// A href resolves if the build emitted either a directory index for it or a real file.
function resolves(href: string): boolean {
  const clean = href.split(/[#?]/)[0];
  const asPage = join(dist, clean, "index.html");
  if (existsSync(asPage)) return true;
  const asFile = join(dist, clean);
  return existsSync(asFile) && statSync(asFile).isFile();
}

function internalHrefs(html: string): string[] {
  return [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
}

const NAV_ROUTES = ["/blog/", "/projects/", "/resume/", "/styleguide/"];

describe("the nav promises nothing that 404s", () => {
  it("emits a header nav item for exactly the routes D3 lists, on every page", () => {
    for (const page of pages) {
      const nav = page.html.match(/<ul class="site-header__list"[^>]*>[\s\S]*?<\/ul>/)?.[0];
      expect(nav, `${page.path} has no header nav`).toBeTruthy();
      const hrefs = internalHrefs(nav!);
      expect(hrefs, page.path).toEqual(NAV_ROUTES);
    }
  });

  it("builds a page for every route the header and footer link to", () => {
    const broken: string[] = [];
    for (const page of pages) {
      const chrome = [
        page.html.match(/<header class="site-header"[\s\S]*?<\/header>/)?.[0],
        page.html.match(/<footer[\s\S]*?<\/footer>/)?.[0],
      ].filter(Boolean) as string[];
      for (const region of chrome) {
        for (const href of internalHrefs(region)) {
          if (!resolves(href)) broken.push(`${page.path} -> ${href}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("links to no unbuilt route anywhere in the output, /about/ included", () => {
    const broken: string[] = [];
    for (const page of pages) {
      for (const href of internalHrefs(page.html)) {
        if (!resolves(href)) broken.push(`${page.path} -> ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe("the disclosure's accessible wiring", () => {
  it("points aria-controls at an id that exists on the same page", () => {
    for (const page of pages) {
      const controls = page.html.match(/<button[^>]*data-nav-toggle[^>]*>/)?.[0];
      expect(controls, `${page.path} has no nav toggle`).toBeTruthy();
      const id = controls!.match(/aria-controls="([^"]+)"/)?.[1];
      expect(id, page.path).toBeTruthy();
      expect(page.html, `${page.path}: no element with id="${id}"`).toContain(`id="${id}"`);
    }
  });

  it("ships the toggle collapsed and as a real button, so the label and state agree", () => {
    for (const page of pages) {
      const toggle = page.html.match(/<button[^>]*data-nav-toggle[^>]*>/)![0];
      expect(toggle, page.path).toContain('type="button"');
      expect(toggle, page.path).toContain('aria-expanded="false"');
    }
  });

  it("hides both toggle icons from the accessibility tree, leaving only the text label", () => {
    for (const page of pages) {
      const icons = page.html.match(/<svg[^>]*data-icon="[^"]*"[^>]*>/g) ?? [];
      expect(icons.length, page.path).toBe(2);
      for (const icon of icons) {
        expect(icon, page.path).toContain('aria-hidden="true"');
        expect(icon, page.path).toContain('focusable="false"');
      }
    }
  });

  it("sets the js class inline in the head, or the panel paints open and snaps shut", () => {
    for (const page of pages) {
      const head = page.html.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? "";
      expect(head, page.path).toContain('classList.add("js")');
      // Inline, not bundled: a deferred script lands after first paint.
      expect(head, page.path).not.toMatch(/<script[^>]+src=[^>]*>[^<]*classList\.add\("js"\)/);
    }
  });
});

// D10. The block that stood here asserted /resume/ was a stub: noindex, a five-heading
// run including Projects, five "Not written yet." lines. All three are false now that
// the page carries real content, so these assertions guard what replaced them.
//
// The privacy cases are why this block is not optional. /resume/ publishes a real
// person's professional history under a standing requirement that no phone number and
// no city or state ever reach the repo or the built site. Nothing in the type system
// stops a later edit from adding a `location` to src/lib/resume.ts or a `telephone` to
// the JSON-LD — these do. They read the built HTML, because the built HTML is what
// ships, and the data module directly, because that layer fails without a build.

const PHONE_SHAPED = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const FORBIDDEN_KEYS = [
  "telephone",
  "address",
  "addressLocality",
  "addressRegion",
  "postalCode",
  "PostalAddress",
  "homeLocation",
  "workLocation",
];

function resumePage(): string {
  const resume = pages.find((p) => p.path === join("resume", "index.html"));
  expect(resume, "no resume page built").toBeTruthy();
  return resume!.html;
}

describe("the resume page keeps the contract its content is published under", () => {
  it("is indexable, now that there is something worth finding", () => {
    expect(resumePage()).toMatch(/<meta name="robots" content="index, follow, max-image-preview:large"/);
  });

  it("shows the four sections that have content, and no heading that promises more", () => {
    const html = resumePage();
    const body = html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? html;
    const headings = [...body.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1].trim());
    expect(headings).toEqual(["Summary", "Experience", "Skills", "Education"]);
  });

  it("publishes no phone number: no tel: href and no phone-shaped digit run", () => {
    const html = resumePage();
    expect(html).not.toContain("tel:");
    expect(PHONE_SHAPED.exec(html)?.[0] ?? null).toBeNull();
  });

  it("puts no address, locality or telephone in the structured data", () => {
    const ld = resumePage().match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(ld, "no JSON-LD block on the resume page").toBeTruthy();
    // Parse first: a key hidden behind a \u escape would slip a raw substring scan.
    const graph = JSON.stringify(JSON.parse(ld!));
    for (const key of FORBIDDEN_KEYS) {
      expect(graph, `JSON-LD carries "${key}"`).not.toContain(key);
    }
    expect(PHONE_SHAPED.exec(graph)?.[0] ?? null).toBeNull();
  });

  it("ships no placeholder link — a profile with no URL renders no list item", () => {
    expect(resumePage()).not.toContain('href="#"');
  });

  // D9/D10. The icons are decoration bolted onto three links that are the page's whole
  // point of contact, and the `CONTACT_ICONS[label] && …` guard in resume.astro is the
  // one branch in this change. Two ways it can regress silently: an icon-only link if
  // the label span is ever dropped (the glyph is aria-hidden, so the link would then
  // have no accessible name at all), and an unmapped label rendering a guessed or
  // broken glyph instead of falling through to plain text. Neither shows up in
  // `astro check` — both are attribute values and template branches.
  it("keeps every contact link's visible text label beside its glyph", () => {
    const html = resumePage();
    const list = html.match(/<ul class="resume__contact"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
    expect(list, "no resume contact list built").toBeTruthy();
    const items = [...list!.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    expect(items.length).toBe(3);
    for (const item of items) {
      const label = item.match(/<span class="resume__contact-label"[^>]*>([^<]*)<\/span>/)?.[1]?.trim();
      expect(label, `contact item has no visible label: ${item}`).toBeTruthy();
      const icons = [...item.matchAll(/<svg[^>]*class="resume__icon"[\s\S]*?<\/svg>/g)];
      expect(icons.length, `expected one glyph beside "${label}"`).toBe(1);
      expect(icons[0][0]).toContain('aria-hidden="true"');
      expect(icons[0][0]).toContain('focusable="false"');
      expect(icons[0][0]).toContain('viewBox="0 0 16 16"');
      expect(icons[0][0]).toContain('fill="currentColor"');
      // The && guard renders nothing for an unmapped label; it must never print itself
      // as text. Tags are stripped first, or focusable="false" trips this.
      expect(item.replace(/<[^>]*>/g, " ")).not.toMatch(/\bfalse\b/);
      // A glyph is a path, never a hex fill of its own: the icons take --link via
      // currentColor, which is what keeps them inside the token rule.
      expect(icons[0][0]).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
    expect(items[0]).toContain(`mailto:${RESUME.email}`);
  });

  it("hides the glyphs on paper, and only on the route that ships them", () => {
    const html = resumePage();
    const print = atRuleBody(html, "@media print{");
    expect(print, "resume page ships no @media print block").toContain(".resume__icon");
    expect(print).toMatch(/\.resume__icon\{[^}]*display:\s*none/);
    for (const page of pages) {
      if (page.path === join("resume", "index.html")) continue;
      expect(page.html, `${page.path} carries a print rule that belongs to /resume/`).not.toContain(
        "resume__icon",
      );
    }
  });

  it("keeps the data module itself free of a location or a phone number", () => {
    // Keys, not values: "Toyota mobile application" is a bullet, not a phone field, so
    // a substring scan over the prose cries wolf. Field names are the surface a leak
    // actually arrives through.
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) {
          keys.add(k.toLowerCase());
          walk(v);
        }
    };
    walk(RESUME);
    const forbidden = [
      ...FORBIDDEN_KEYS.map((k) => k.toLowerCase()),
      "location",
      "locality",
      "region",
      "city",
      "phone",
      "tel",
    ];
    expect([...keys].filter((k) => forbidden.some((f) => k.includes(f)))).toEqual([]);
    expect(PHONE_SHAPED.exec(JSON.stringify(RESUME))?.[0] ?? null).toBeNull();
  });
});
