import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// These assertions are about the built HTML, not about source. They cover the two
// things that would fail silently on an upgrade: Shiki writing its theme back onto
// code blocks, and a page losing the title/description budget Phase 4 builds on.

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(join(dir, e.name)) : e.name.endsWith(".html") ? [join(dir, e.name)] : [],
  );
}

let pages: { path: string; html: string }[] = [];

beforeAll(() => {
  // An empty dist/ is a real state — a failed build leaves one behind — so the
  // presence of HTML is the condition, not the presence of the directory.
  if (!existsSync(dist) || htmlFiles(dist).length === 0) {
    execFileSync("npx", ["astro", "build"], { cwd: root, stdio: "ignore", timeout: 300_000 });
  }
  pages = htmlFiles(dist).map((path) => ({ path: relative(dist, path), html: readFileSync(path, "utf8") }));
}, 300_000);

describe("the build output itself", () => {
  it("contains the thirteen pages this phase generates", () => {
    expect(pages.length).toBe(13);
  });
});

describe("code blocks", () => {
  it("carry no inline style, so prose.css tokens still own them", () => {
    const styled = pages.filter((p) => /<pre[^>]*\sstyle=/.test(p.html)).map((p) => p.path);
    expect(styled).toEqual([]);
  });

  it("keep the tabindex that makes a horizontally scrolling region keyboard-reachable", () => {
    const posts = pages.filter((p) => p.path.startsWith("blog/") && p.html.includes("<pre"));
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      for (const pre of post.html.match(/<pre[^>]*>/g) ?? []) {
        expect(pre, post.path).toContain('tabindex="0"');
      }
    }
  });

  it("emit no raw hex colours into the markup", () => {
    const leaked = pages.filter((p) => /<(pre|span)[^>]*(color|background)\s*:\s*#/.test(p.html));
    expect(leaked.map((p) => p.path)).toEqual([]);
  });
});

describe("head budget", () => {
  it("gives every page a unique title of 60 characters or fewer", () => {
    const titles = pages.map((p) => {
      const title = p.html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      expect(title.length, `${p.path}: "${title}"`).toBeGreaterThan(0);
      expect(title.length, `${p.path}: "${title}"`).toBeLessThanOrEqual(60);
      return title;
    });
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("gives every page a unique description of 155 characters or fewer", () => {
    const descriptions = pages.map((p) => {
      const d = p.html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
      expect(d.length, p.path).toBeGreaterThan(0);
      expect(d.length, p.path).toBeLessThanOrEqual(155);
      return d;
    });
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

// Issue #17: Astro compiles a page's scoped `.hero .button--ghost` to four compound
// units, which outranks the shared `.button--ghost:hover` in global.css, so the hover
// background silently never applied. Nothing in the type system or the build catches a
// lost cascade, so the invariant is asserted here instead of the exact selector text:
// whichever scoped rule sets the ghost CTA's hover background must still beat every
// non-hover rule that sets the same property on the same element.
function specificity(selector: string): [number, number, number] {
  let rest = selector.trim();
  const take = (re: RegExp) => {
    const found = rest.match(re) ?? [];
    rest = rest.replace(re, " ");
    return found.length;
  };
  const attributes = take(/\[[^\]]*\]/g);
  const ids = take(/#[\w-]+/g);
  const pseudoElements = take(/::[\w-]+/g);
  const pseudoClasses = take(/:[\w-]+(?:\([^)]*\))?/g);
  const classes = take(/\.[\w-]+/g);
  const elements = take(/[a-zA-Z][\w-]*/g);
  return [ids, classes + attributes + pseudoClasses, elements + pseudoElements];
}

function outranks(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

describe("the hero's ghost CTA hover state", () => {
  const ghostBackgroundRules = () => {
    const home = pages.find((p) => p.path === "index.html");
    expect(home, "dist/index.html").toBeDefined();
    const css = [...home!.html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m, order) => ({ selector: m[1].trim(), declarations: m[2], order }))
      .filter((r) => r.selector.includes(".button--ghost") && /(^|;)\s*background\s*:/.test(r.declarations));
  };

  it("restates the hover background inside the hero's own scope", () => {
    const hover = ghostBackgroundRules().filter((r) => r.selector.includes(":hover"));
    expect(hover.length, "no scoped :hover background rule for .button--ghost on /").toBe(1);
  });

  it("is not outranked by the scoped opaque fill that caused issue #17", () => {
    const rules = ghostBackgroundRules();
    const hover = rules.filter((r) => r.selector.includes(":hover"));
    const base = rules.filter((r) => !r.selector.includes(":hover"));
    expect(base.length).toBeGreaterThan(0);

    for (const h of hover) {
      for (const b of base) {
        const delta = outranks(specificity(h.selector), specificity(b.selector));
        // A tie is only safe when the hover rule is also later in source order.
        const wins = delta > 0 || (delta === 0 && h.order > b.order);
        expect(wins, `"${h.selector}" (${specificity(h.selector)}) loses to "${b.selector}" (${specificity(b.selector)})`).toBe(
          true,
        );
      }
    }
  });

  it("paints that hover background from a token, not a literal colour", () => {
    for (const rule of ghostBackgroundRules()) {
      expect(rule.declarations, rule.selector).toMatch(/background\s*:\s*var\(--/);
      expect(rule.declarations, rule.selector).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it("keeps the shared ghost hover rule in the bundled stylesheet", () => {
    const bundle = readdirSync(join(dist, "_astro"))
      .filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(join(dist, "_astro", f), "utf8"))
      .join("\n");
    expect(bundle).toMatch(/\.button--ghost:hover\{[^}]*background:var\(--surface-sunken\)/);
  });
});

describe("routing contract", () => {
  it("writes every internal href with a trailing slash", () => {
    const offenders: string[] = [];
    for (const page of pages) {
      for (const match of page.html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const href = match[1];
        if (href === "/" || href.endsWith("/")) continue;
        // Asset requests are files, not routes.
        if (/\.[a-z0-9]+$/i.test(href)) continue;
        offenders.push(`${page.path} -> ${href}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("generates a tag archive for every tag a published post links to", () => {
    const linked = new Set<string>();
    for (const page of pages) {
      for (const match of page.html.matchAll(/href="\/blog\/tags\/([^/"]+)\//g)) linked.add(match[1]);
    }
    expect(linked.size).toBeGreaterThan(0);
    for (const tag of linked) {
      expect(pages.some((p) => p.path === join("blog", "tags", tag, "index.html")), tag).toBe(true);
    }
  });

  it("keeps the styleguide out of the index", () => {
    const styleguide = pages.find((p) => p.path === join("styleguide", "index.html"));
    expect(styleguide?.html).toContain('name="robots"');
    expect(styleguide?.html).toContain("noindex");
  });
});
