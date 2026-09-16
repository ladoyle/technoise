import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// The three non-HTML routes and the OG card are the surfaces no page renders, so
// nothing else fails when they drift. The sitemap's parity obligation is the one
// the hand-rolled endpoint took on in place of @astrojs/sitemap: every indexable
// page listed once, every <loc> a page that exists.

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? htmlFiles(join(dir, e.name))
      : e.name.endsWith(".html")
        ? [join(dir, e.name)]
        : [],
  );
}

let pages: { route: string; html: string }[] = [];
let sitemap = "";
let feed = "";
let robots = "";
let locs: string[] = [];

beforeAll(() => {
  // Always build. Reusing an existing dist/ meant a tree left behind by another
  // branch could be asserted against and reported green.
  execFileSync("npx", ["astro", "build"], { cwd: root, stdio: "ignore", timeout: 300_000 });
  pages = htmlFiles(dist).map((path) => ({
    // dist/blog/index.html -> /blog/
    route: `/${relative(dist, path).replace(/index\.html$/, "").split(/[\\/]/).join("/")}`,
    html: readFileSync(path, "utf8"),
  }));
  sitemap = readFileSync(join(dist, "sitemap.xml"), "utf8");
  feed = readFileSync(join(dist, "rss.xml"), "utf8");
  robots = readFileSync(join(dist, "robots.txt"), "utf8");
  locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}, 300_000);

const isNoindex = (html: string) => /<meta name="robots" content="noindex/.test(html);
const pathOf = (loc: string) => new URL(loc).pathname;

const lastmodOf = (path: string): string | undefined => {
  for (const [, block] of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (loc && pathOf(loc) === path) return block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
  }
  return undefined;
};

// A post route, never a tag archive and never a /blog/<n>/ pagination page. The
// numeric exclusion matters: a bare-number slug is rejected at build time, so a digit
// segment here is always pagination, and without it these tests would break for a
// spurious reason the first time an eleventh post pushes /blog/2/ into the build.
const POST_ROUTE = /^\/blog\/(?!tags\/)(?!\d+\/$)[^/]+\/$/;

describe("sitemap.xml", () => {
  it("lists every indexable page that the build produced", () => {
    const listed = new Set(locs.map(pathOf));
    const missing = pages.filter((p) => !isNoindex(p.html) && !listed.has(p.route)).map((p) => p.route);
    expect(missing).toEqual([]);
  });

  it("lists nothing that is not a built page", () => {
    const built = new Set(pages.map((p) => p.route));
    expect(locs.map(pathOf).filter((path) => !built.has(path))).toEqual([]);
  });

  it("lists no noindex page — a sitemap entry and a noindex tag contradict each other", () => {
    const listed = new Set(locs.map(pathOf));
    const contradictions = pages.filter((p) => isNoindex(p.html) && listed.has(p.route)).map((p) => p.route);
    expect(contradictions).toEqual([]);
    expect(listed.has("/styleguide/")).toBe(false);
  });

  it("lists each URL exactly once", () => {
    expect(new Set(locs).size).toBe(locs.length);
  });

  it("writes every loc as an absolute URL with a trailing slash", () => {
    for (const loc of locs) {
      expect(loc, loc).toMatch(/^https?:\/\//);
      expect(loc.endsWith("/"), loc).toBe(true);
    }
  });

  it("carries only loc and lastmod, in the ISO date form", () => {
    expect(sitemap).not.toMatch(/<changefreq>|<priority>/);
    for (const m of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      expect(m[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("declares the sitemaps.org namespace a validator checks first", () => {
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });
});

describe("rss.xml", () => {
  const items = () => [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const field = (item: string, tag: string) =>
    item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";

  it("carries the atom self link and namespace feed validators look for", () => {
    expect(feed).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(feed).toMatch(/<atom:link href="[^"]+\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/);
  });

  it("has one item per published post and no project", () => {
    const postRoutes = pages.map((p) => p.route).filter((r) => POST_ROUTE.test(r));
    expect(postRoutes.length).toBeGreaterThan(0);
    expect(items()).toHaveLength(postRoutes.length);
    for (const item of items()) {
      // A pagination page is not a feed item.
      expect(pathOf(field(item, "link"))).toMatch(POST_ROUTE);
    }
    expect(feed).not.toContain("/projects/");
  });

  it("gives every item a permalink guid equal to its link", () => {
    for (const item of items()) {
      expect(field(item, "guid")).toBe(field(item, "link"));
      expect(item).toContain('<guid isPermaLink="true">');
    }
  });

  it("orders items newest first, matching the listing's publishing rule", () => {
    const stamps = items().map((i) => Date.parse(field(i, "pubDate")));
    expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
  });

  it("dates lastBuildDate from content, not from the clock, so a rebuild is byte-identical", () => {
    const raw = feed.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/)?.[1];
    expect(raw, "lastBuildDate").toBeDefined();
    const lastBuild = Date.parse(raw!);

    // The sitemap's /blog/ lastmod answers the same question — when did the blog last
    // change — from the same posts, so the two have to agree. Asserting against that
    // rather than against the newest item pubDate is what makes this exercise the
    // updatedDate rule: once any post carries an updatedDate, the two dates diverge
    // and only a feed reading `updatedDate ?? pubDate` still matches.
    expect(new Date(lastBuild).toISOString().slice(0, 10)).toBe(lastmodOf("/blog/"));

    // An edit can only move it forward: never earlier than the newest published item.
    expect(lastBuild).toBeGreaterThanOrEqual(
      Math.max(...items().map((i) => Date.parse(field(i, "pubDate")))),
    );
  });

  it("emits no unescaped markup — an item description is data, never HTML", () => {
    for (const item of items()) {
      expect(field(item, "description")).not.toMatch(/<[a-z/]/i);
      expect(field(item, "title")).not.toMatch(/<[a-z/]/i);
    }
  });
});

describe("robots.txt", () => {
  it("allows the whole site and disallows nothing — a blocked page cannot be read as noindex", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).not.toMatch(/^Disallow:/m);
  });

  it("points at the sitemap this build actually emitted", () => {
    const declared = robots.match(/^Sitemap: (\S+)$/m)?.[1];
    expect(declared).toBeDefined();
    expect(pathOf(declared!)).toBe("/sitemap.xml");
    expect(existsSync(join(dist, "sitemap.xml"))).toBe(true);
    // Same origin as the canonicals, or Search Console rejects the submission.
    const canonical = pages.find((p) => p.route === "/")?.html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    expect(new URL(declared!).origin).toBe(new URL(canonical!).origin);
  });

  it("is not shadowed by a committed public/robots.txt, which would silently win", () => {
    expect(existsSync(join(root, "public", "robots.txt"))).toBe(false);
  });
});

describe("the Open Graph card", () => {
  const card = join(root, "public", "og", "technoise-og.png");

  it("is a 1200x630 PNG with no alpha channel, under the 200 KB budget", () => {
    const bytes = readFileSync(card);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    // IHDR: width and height are the first two big-endian u32 of the chunk data.
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    // colourType 6 and 4 are the two that carry an alpha channel; a transparent OG
    // image renders black on several social clients.
    expect([0, 2, 3]).toContain(bytes.readUInt8(25));
    expect(statSync(card).size).toBeLessThan(200 * 1024);
  });

  it("is referenced absolutely by every page, as LinkedIn and Facebook require", () => {
    for (const page of pages) {
      const og = page.html.match(/property="og:image" content="([^"]+)"/)?.[1];
      const tw = page.html.match(/name="twitter:image" content="([^"]+)"/)?.[1];
      expect(og, page.route).toMatch(/^https?:\/\/.+\/og\/technoise-og\.png$/);
      expect(tw, page.route).toBe(og);
    }
    expect(existsSync(join(dist, "og", "technoise-og.png"))).toBe(true);
  });
});

describe("the head contract every page shares", () => {
  it("emits exactly one robots meta and one canonical per page", () => {
    for (const page of pages) {
      expect(page.html.match(/<meta name="robots"/g) ?? [], page.route).toHaveLength(1);
      expect(page.html.match(/rel="canonical"/g) ?? [], page.route).toHaveLength(1);
    }
  });

  it("makes og:url identical to the canonical, character for character", () => {
    for (const page of pages) {
      const canonical = page.html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      const ogUrl = page.html.match(/property="og:url" content="([^"]+)"/)?.[1];
      expect(ogUrl, page.route).toBe(canonical);
      expect(new URL(canonical!).pathname, page.route).toBe(page.route);
    }
  });

  it("offers the feed from every page, including the noindex one", () => {
    for (const page of pages) {
      expect(page.html, page.route).toMatch(
        /<link rel="alternate" type="application\/rss\+xml" title="TechNoise" href="[^"]+\/rss\.xml"/,
      );
    }
  });

  it("emits at most one ld+json block, and every one parses as JSON", () => {
    for (const page of pages) {
      const blocks = [...page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(blocks.length, page.route).toBeLessThanOrEqual(1);
      for (const [, payload] of blocks) {
        expect(payload, page.route).not.toContain("<");
        const graph = JSON.parse(payload);
        expect(graph["@context"], page.route).toBe("https://schema.org");
        expect(Array.isArray(graph["@graph"]), page.route).toBe(true);
        expect(graph["@graph"].length, page.route).toBeGreaterThan(0);
      }
    }
  });

  it("never describes a breadcrumb trail the reader cannot see", () => {
    // Schema-only breadcrumbs are exactly what Google's spam policies name.
    for (const page of pages) {
      if (page.html.includes("BreadcrumbList")) {
        expect(page.html, page.route).toContain('class="breadcrumb"');
      }
    }
  });
});

// The block above proves the payload parses and carries a @graph. It cannot tell a
// correct BlogPosting from an empty one, and its "at most one block" assertion passes
// vacuously if the script tag ever stops matching the regex. These name the types and
// the fields each page owes, and assert the pages that must carry a graph do.
describe("the JSON-LD graph each page type publishes", () => {
  const graphOf = (html: string): Record<string, any>[] => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(blocks).toHaveLength(1);
    return JSON.parse(blocks[0][1])["@graph"];
  };
  const nodesOf = (route: string) => graphOf(pages.find((p) => p.route === route)!.html);
  const typed = (graph: Record<string, any>[], type: string) =>
    graph.filter((node) => node["@type"] === type);
  const routes = (re: RegExp) => pages.map((p) => p.route).filter((r) => re.test(r));
  const isAbsolute = (value: string) => /^https:\/\/[^/]+\//.test(value);

  it("gives the home page a WebSite whose publisher resolves inside its own graph", () => {
    const graph = nodesOf("/");
    const [site] = typed(graph, "WebSite");
    const [person] = typed(graph, "Person");
    expect(graph).toHaveLength(2);
    expect(site, "WebSite node").toBeDefined();
    expect(person, "Person node").toBeDefined();

    expect(isAbsolute(site.url)).toBe(true);
    expect(site.name).toBe("TechNoise");
    expect(site.description.length).toBeGreaterThan(0);
    expect(site.inLanguage).toBe("en");
    // A dangling @id reference is worse than no publisher: it claims a node nobody can
    // resolve from this page.
    expect(site.publisher["@id"]).toBe(person["@id"]);

    expect(person["@id"]).toMatch(/#person$/);
    expect(person.name.length).toBeGreaterThan(0);
    expect(isAbsolute(person.url)).toBe(true);
    // sameAs carries the supplied profile links, never an empty array.
    expect(Array.isArray(person.sameAs)).toBe(true);
    expect(person.sameAs.length).toBeGreaterThan(0);
    for (const href of person.sameAs) {
      expect(() => new URL(href)).not.toThrow();
    }
  });

  it("gives every post a BlogPosting with the fields a rich result needs", () => {
    const postRoutes = routes(POST_ROUTE);
    expect(postRoutes.length).toBeGreaterThan(0);

    for (const route of postRoutes) {
      const graph = nodesOf(route);
      const [post] = typed(graph, "BlogPosting");
      expect(post, route).toBeDefined();

      expect(post["@id"], route).toBe(`${post.url}#post`);
      expect(post.headline.length, route).toBeGreaterThan(0);
      // Google truncates a headline past 110 characters.
      expect(post.headline.length, route).toBeLessThanOrEqual(110);
      expect(post.description.length, route).toBeGreaterThan(0);
      expect(new URL(post.url).pathname, route).toBe(route);
      expect(post.mainEntityOfPage, route).toEqual({ "@type": "WebPage", "@id": post.url });
      expect(post.datePublished, route).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.dateModified, route).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // dateModified is updatedDate ?? pubDate, so it can equal but never precede it.
      expect(post.dateModified >= post.datePublished, route).toBe(true);
      expect(post.timeRequired, route).toMatch(/^PT[1-9]\d*M$/);
      expect(post.inLanguage, route).toBe("en");
      expect(Array.isArray(post.image) && post.image.every(isAbsolute), route).toBe(true);
      expect(post.image.length, route).toBeGreaterThan(0);
      expect(post.author["@type"], route).toBe("Person");
      expect(post.author.name.length, route).toBeGreaterThan(0);
      expect(isAbsolute(post.author.url), route).toBe(true);

      // keywords mirror the article:tag metas, from the same frontmatter array.
      const tags = [...pages.find((p) => p.route === route)!.html.matchAll(
        /property="article:tag" content="([^"]+)"/g,
      )].map((m) => m[1]);
      expect(post.keywords, route).toBe(tags.join(", "));
      expect(tags.length, route).toBeGreaterThan(0);
    }
  });

  it("gives every project a CreativeWork and claims no publication date for it", () => {
    const projectRoutes = routes(/^\/projects\/[^/]+\/$/);
    expect(projectRoutes.length).toBeGreaterThan(0);

    for (const route of projectRoutes) {
      const html = pages.find((p) => p.route === route)!.html;
      const graph = nodesOf(route);
      const [work] = typed(graph, "CreativeWork");
      expect(work, route).toBeDefined();

      expect(work["@id"], route).toBe(`${work.url}#project`);
      expect(work.name.length, route).toBeGreaterThan(0);
      expect(work.description.length, route).toBeGreaterThan(0);
      expect(new URL(work.url).pathname, route).toBe(route);
      expect(work.dateCreated, route).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(work.keywords.length, route).toBeGreaterThan(0);
      // The same human-readable label the page prints, not the raw frontmatter enum.
      expect(["In progress", "Shipped", "Archived"], route).toContain(work.creativeWorkStatus);
      expect(html, route).toContain(work.creativeWorkStatus);
      expect(work.inLanguage, route).toBe("en");
      expect(Array.isArray(work.image) && work.image.every(isAbsolute), route).toBe(true);
      expect(work.author["@type"], route).toBe("Person");
      if ("sameAs" in work) {
        expect(work.sameAs.length, route).toBeGreaterThan(0);
        expect(work.sameAs.every((href: string) => /^https?:\/\//.test(href)), route).toBe(true);
      }

      // A project is a portfolio entry, not a dated article: og:type stays website and
      // no article:* claim is made that the schema cannot support.
      expect(html, route).toContain('property="og:type" content="website"');
      expect(html, route).not.toContain("article:published_time");
    }
  });

  it("matches every BreadcrumbList to the visible trail, item for item", () => {
    // Driven from the schema side, not the markup side: /styleguide/ renders a
    // Breadcrumb specimen that describes no real trail, and correctly publishes no
    // BreadcrumbList for it. The block above already guards the other direction.
    const withTrail = pages.filter((p) => p.html.includes("BreadcrumbList"));
    expect(withTrail.length).toBeGreaterThan(0);

    for (const page of withTrail) {
      const nav = page.html.match(/<nav class="breadcrumb"[\s\S]*?<\/nav>/)![0];
      const visible = [...nav.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({
        label: m[1].replace(/<[^>]+>/g, "").trim(),
        href: m[1].match(/href="([^"]+)"/)?.[1],
      }));

      const [crumbs] = typed(graphOf(page.html), "BreadcrumbList");
      expect(crumbs, page.route).toBeDefined();
      const items = crumbs.itemListElement;

      expect(items.map((i: any) => i.position), page.route).toEqual(
        visible.map((_, index) => index + 1),
      );
      expect(items.map((i: any) => i.name), page.route).toEqual(visible.map((v) => v.label));

      items.forEach((item: any, index: number) => {
        expect(item["@type"], page.route).toBe("ListItem");
        if (index === items.length - 1) {
          // The current page is a <span aria-current="page"> with no href; the schema
          // must not invent an item for it.
          expect(visible[index].href, page.route).toBeUndefined();
          expect(item, page.route).not.toHaveProperty("item");
        } else {
          expect(new URL(item.item).pathname, page.route).toBe(visible[index].href);
        }
      });

      // The last crumb names the page, so it has to agree with the <h1>.
      const h1 = page.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1].replace(/<[^>]+>/g, "").trim();
      expect(items[items.length - 1].name, page.route).toBe(h1);
    }
  });

  it("emits a graph on exactly the routes that own one", () => {
    const hasGraph = (route: string) =>
      pages.find((p) => p.route === route)!.html.includes("application/ld+json");
    // Home, every post, every project and every tag archive.
    const owed = [
      "/",
      ...routes(POST_ROUTE),
      ...routes(/^\/projects\/[^/]+\/$/),
      ...routes(/^\/blog\/tags\/[^/]+\/$/),
    ];
    expect(owed.filter((route) => !hasGraph(route))).toEqual([]);
    // The blog index is one level deep — no trail, so no BreadcrumbList and no graph.
    expect(hasGraph("/blog/")).toBe(false);
    expect(pages.find((p) => p.route === "/blog/")!.html).not.toContain("BreadcrumbList");
  });
});
