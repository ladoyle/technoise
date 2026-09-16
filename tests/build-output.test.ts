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
  it("contains the twelve pages this phase generates", () => {
    expect(pages.length).toBe(12);
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
