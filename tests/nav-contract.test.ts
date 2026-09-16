import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

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
  if (!existsSync(dist) || htmlFiles(dist).length === 0) {
    execFileSync("npx", ["astro", "build"], { cwd: root, stdio: "ignore", timeout: 300_000 });
  }
  pages = htmlFiles(dist).map((path) => ({ path: relative(dist, path), html: readFileSync(path, "utf8") }));
}, 300_000);

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

describe("the resume stub stays honest while it is empty", () => {
  it("is noindex, so an empty page cannot cost the SEO floor", () => {
    const resume = pages.find((p) => p.path === join("resume", "index.html"));
    expect(resume, "no resume page built").toBeTruthy();
    expect(resume!.html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  });

  it("invents no employer, date or outcome — every section reads 'Not written yet.'", () => {
    const resume = pages.find((p) => p.path === join("resume", "index.html"))!;
    const body = resume.html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? resume.html;
    const headings = [...body.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1].trim());
    expect(headings).toEqual(["Summary", "Experience", "Projects", "Skills", "Education"]);
    const pending = [...body.matchAll(/class="resume__pending"[^>]*>([^<]*)</g)].map((m) => m[1].trim());
    expect(pending).toEqual(Array(5).fill("Not written yet."));
  });
});
