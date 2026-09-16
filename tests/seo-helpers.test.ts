import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MissingSiteError,
  OG_IMAGE,
  SITE,
  STATIC_SITEMAP_ROUTES,
  absoluteUrl,
  assertMetaBudget,
  breadcrumbList,
  canonicalPath,
  escapeXml,
  jsonLdSafe,
  pageTitle,
  rfc822,
} from "../src/lib/seo";

const SITE_URL = new URL("https://example.test/");

describe("absoluteUrl", () => {
  it("fails loudly rather than emitting a relative canonical when site is unset", () => {
    expect(() => absoluteUrl("/blog/", undefined)).toThrow(MissingSiteError);
    // The message has to name the file to edit, or the build failure is a puzzle.
    expect(() => absoluteUrl("/blog/", undefined)).toThrow(/astro\.config\.mjs/);
  });

  it("resolves a rooted path against the configured origin", () => {
    expect(absoluteUrl("/", SITE_URL)).toBe("https://example.test/");
    expect(absoluteUrl("/blog/a-post/", SITE_URL)).toBe("https://example.test/blog/a-post/");
    expect(absoluteUrl("/rss.xml", SITE_URL)).toBe("https://example.test/rss.xml");
  });

  it("keeps the site's own subpath only when the caller's path is relative", () => {
    // Documents the limit the dev report flagged: under a project-subpath deploy,
    // `site` must carry the subpath AND Astro.url.pathname must already include it.
    // A rooted literal such as STATIC_SITEMAP_ROUTES' "/blog/" drops the subpath.
    const sub = new URL("https://example.test/technoise/");
    expect(absoluteUrl("/technoise/blog/", sub)).toBe("https://example.test/technoise/blog/");
    expect(absoluteUrl("/blog/", sub)).toBe("https://example.test/blog/");
  });
});

describe("canonicalPath", () => {
  it("maps the site root to a bare slash", () => {
    expect(canonicalPath(new URL("https://example.test/"))).toBe("/");
  });

  it("adds the trailing slash a directory route needs", () => {
    expect(canonicalPath(new URL("https://example.test/blog"))).toBe("/blog/");
    expect(canonicalPath(new URL("https://example.test/blog/"))).toBe("/blog/");
  });

  it("collapses duplicate slashes so one page cannot own two canonicals", () => {
    expect(canonicalPath(new URL("https://example.test//blog///tags//astro//"))).toBe(
      "/blog/tags/astro/",
    );
  });

  it("leaves a file route alone — /rss.xml must not grow a trailing slash", () => {
    expect(canonicalPath(new URL("https://example.test/rss.xml"))).toBe("/rss.xml");
    expect(canonicalPath(new URL("https://example.test/sitemap.xml"))).toBe("/sitemap.xml");
    expect(canonicalPath(new URL("https://example.test/robots.txt"))).toBe("/robots.txt");
  });

  it("ignores query and hash, which are not part of a canonical", () => {
    expect(canonicalPath(new URL("https://example.test/blog?page=2#top"))).toBe("/blog/");
  });

  it("closes a dotted slug, whose dot is not an extension", () => {
    // Nothing stops a post filename from carrying a dot. The extension guard is
    // anchored at the end and rejects a `-`, so these stay directory routes.
    expect(canonicalPath(new URL("https://example.test/blog/astro-5.0-notes/"))).toBe(
      "/blog/astro-5.0-notes/",
    );
    expect(canonicalPath(new URL("https://example.test/blog/astro-5.0-notes"))).toBe(
      "/blog/astro-5.0-notes/",
    );
  });

  it("reads a slug ending in dot-alphanumerics as a file — the guard's known limit", () => {
    // Documented, not endorsed. A slug like "astro-v5.0" looks like an extension, so
    // an extensionless URL for it would canonicalise without the trailing slash Astro
    // serves it at. Unreachable today: build.format "directory" always hands
    // Astro.url a trailing slash, so the branch never sees this shape. If a future
    // config sets trailingSlash "never", this is the line that fails first.
    expect(canonicalPath(new URL("https://example.test/blog/astro-v5.0"))).toBe(
      "/blog/astro-v5.0",
    );
    expect(canonicalPath(new URL("https://example.test/blog/astro-v5.0/"))).toBe(
      "/blog/astro-v5.0/",
    );
  });
});

describe("pageTitle and the meta budget", () => {
  it("leaves exactly the schema's 48-character title allowance inside the 60 budget", () => {
    expect(SITE.titleSuffix.length).toBe(12);
    const maxContentTitle = "x".repeat(48);
    expect(pageTitle(maxContentTitle)).toHaveLength(60);
    expect(() => assertMetaBudget(pageTitle(maxContentTitle), "d", "/where/")).not.toThrow();
  });

  it("throws on the first character over budget, naming the page and the length", () => {
    expect(() => assertMetaBudget("x".repeat(61), "d", "/blog/too-long/")).toThrow(
      /\/blog\/too-long\/.*61 characters/s,
    );
  });

  it("applies the same rule to the description at 155", () => {
    expect(() => assertMetaBudget("t", "d".repeat(155), "/p/")).not.toThrow();
    expect(() => assertMetaBudget("t", "d".repeat(156), "/p/")).toThrow(/\/p\/.*156 characters/s);
  });
});

describe("escapeXml", () => {
  it("escapes all five XML-significant characters", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("escapes the ampersand first, so nothing is double-encoded", () => {
    // The order-sensitive case: replacing & last would turn &lt; into &amp;lt;.
    expect(escapeXml("<b>")).toBe("&lt;b&gt;");
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  it("encodes a pre-encoded entity exactly once, so it round-trips to itself", () => {
    // A title literally containing "&amp;" must survive as "&amp;", not "&".
    const escaped = escapeXml("Tom &amp; Jerry");
    expect(escaped).toBe("Tom &amp;amp; Jerry");
    expect(decodeXml(escaped)).toBe("Tom &amp; Jerry");
  });

  it("round-trips a hostile title and a CDATA terminator character-for-character", () => {
    const hostile = `A & B </script><img src=x> "q" 'p' ]]> é`;
    const escaped = escapeXml(hostile);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(decodeXml(escaped)).toBe(hostile);
  });

  it("is a no-op on text with nothing to escape", () => {
    expect(escapeXml("plain text 123")).toBe("plain text 123");
  });
});

// Entity decode in the reverse order of escapeXml: &amp; last, or a single-escaped
// "&amp;lt;" would decode two levels and the round-trip would prove nothing.
function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("jsonLdSafe", () => {
  it("emits no literal `<`, so a value can never close the ld+json script", () => {
    const payload = jsonLdSafe({ headline: "</script><img src=x onerror=alert(1)>" });
    expect(payload).not.toContain("<");
    expect(payload).not.toContain("</script>");
    expect(payload).toContain("\\u003c");
  });

  it("stays valid JSON that parses back to the original value", () => {
    const value = {
      "@context": "https://schema.org",
      "@graph": [{ "@type": "BlogPosting", headline: `</script> & "quotes" 'apostrophes'` }],
    };
    expect(JSON.parse(jsonLdSafe(value))).toEqual(value);
  });

  it("escapes `<` at every depth, not just the top level", () => {
    const payload = jsonLdSafe({ a: [{ b: { c: ["<script>"] } }] });
    expect(payload).not.toContain("<");
    expect(JSON.parse(payload).a[0].b.c[0]).toBe("<script>");
  });

  it("escapes a `<` that appears in a key as well as a value", () => {
    const payload = jsonLdSafe({ "</script>": 1 });
    expect(payload).not.toContain("<");
    expect(Object.keys(JSON.parse(payload))).toEqual(["</script>"]);
  });

  it("leaves a literal backslash-u sequence in the data unchanged", () => {
    // A value that already reads "<" must not be confused with the escape.
    expect(JSON.parse(jsonLdSafe({ s: "\\u003c" })).s).toBe("\\u003c");
  });
});

describe("breadcrumbList", () => {
  const trail = [
    { label: "Home", href: "/" },
    { label: "Blog", href: "/blog/" },
    { label: "A post" },
  ];

  it("numbers positions from one, in trail order", () => {
    const node = breadcrumbList(trail, SITE_URL) as {
      itemListElement: { position: number; name: string }[];
    };
    expect(node.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(node.itemListElement.map((i) => i.name)).toEqual(["Home", "Blog", "A post"]);
  });

  it("gives the current page no `item`, matching the component's hrefless last entry", () => {
    const node = breadcrumbList(trail, SITE_URL) as {
      itemListElement: Record<string, unknown>[];
    };
    expect(node.itemListElement[0].item).toBe("https://example.test/");
    expect(node.itemListElement[1].item).toBe("https://example.test/blog/");
    expect(node.itemListElement[2]).not.toHaveProperty("item");
  });

  it("declares the schema.org type the rich result needs", () => {
    const node = breadcrumbList(trail, SITE_URL) as Record<string, unknown>;
    expect(node["@type"]).toBe("BreadcrumbList");
  });

  it("propagates the missing-site failure rather than emitting a relative item", () => {
    expect(() => breadcrumbList(trail, undefined)).toThrow(MissingSiteError);
  });
});

describe("rfc822", () => {
  it("produces the GMT-suffixed form an RSS pubDate requires", () => {
    expect(rfc822(new Date("2026-09-15T00:00:00Z"))).toBe("Tue, 15 Sep 2026 00:00:00 GMT");
  });

  it("normalises a non-UTC instant to GMT rather than to the build machine's zone", () => {
    expect(rfc822(new Date("2026-09-15T23:30:00+02:00"))).toBe("Tue, 15 Sep 2026 21:30:00 GMT");
  });
});

describe("the constants the head block and the endpoints share", () => {
  it("keeps the site description inside the meta-description budget", () => {
    expect(SITE.description.length).toBeLessThanOrEqual(155);
  });

  it("declares the OG card at the 1.91:1 size every social client expects", () => {
    expect(OG_IMAGE.width).toBe(1200);
    expect(OG_IMAGE.height).toBe(630);
    expect(OG_IMAGE.type).toBe("image/png");
    expect(OG_IMAGE.alt.length).toBeGreaterThan(0);
  });

  it("keeps the noindex styleguide out of the sitemap's static registry", () => {
    expect([...STATIC_SITEMAP_ROUTES]).toEqual(["/", "/blog/", "/projects/"]);
    expect(STATIC_SITEMAP_ROUTES).not.toContain("/styleguide/");
  });
});

describe("the no-hostname-literal rule", () => {
  const src = fileURLToPath(new URL("../src", import.meta.url));

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? sourceFiles(join(dir, e.name))
        : /\.(ts|astro|mjs)$/.test(e.name)
          ? [join(dir, e.name)]
          : [],
    );
  }

  it("writes the site's own origin nowhere but astro.config.mjs", () => {
    // Every canonical, og:url, <loc> and guid derives from `site`, so changing the
    // domain is a one-line edit. A literal anywhere else silently outlives it.
    const offenders = sourceFiles(src)
      .filter((file) => /technoise\.(dev|com|io)|github\.io/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(src.length + 1));
    expect(offenders).toEqual([]);
  });
});
