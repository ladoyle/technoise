import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it, vi } from "vitest";

import SeoHead from "../src/components/SeoHead.astro";

import {
  MissingSiteError,
  OG_IMAGE,
  SITE,
  STATIC_SITEMAP_ROUTES,
  SubpathDeployError,
  absoluteUrl,
  assertMetaBudget,
  assertOgImageSize,
  assertRootDeploy,
  breadcrumbList,
  canonicalPath,
  escapeXml,
  jsonLdSafe,
  pageTitle,
  rfc822,
} from "../src/lib/seo";
import { entryOgImage } from "../src/lib/og-image";

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

  it("refuses a `site` that carries a subpath instead of silently dropping it", () => {
    // The configuration that used to emit https://example.test/blog/ for a site rooted
    // at /sub/ — every canonical, <loc> and guid a 404, with nothing in the build to
    // say so.
    const sub = new URL("https://example.test/sub/");
    expect(() => absoluteUrl("/blog/", sub)).toThrow(SubpathDeployError);
    expect(() => absoluteUrl("/blog/", sub)).toThrow(/astro\.config\.mjs/);
  });

  it("refuses a configured `base`, which no rooted path here would ever pick up", () => {
    vi.stubEnv("BASE_URL", "/sub/");
    try {
      expect(() => absoluteUrl("/blog/", SITE_URL)).toThrow(SubpathDeployError);
      expect(() => absoluteUrl("/blog/", SITE_URL)).toThrow(/`base` in astro\.config\.mjs/);
      // robots.txt is the criterion that cannot be fixed by prefixing: a crawler reads
      // it at the origin root only, so the message has to name it.
      expect(() => absoluteUrl("/blog/", SITE_URL)).toThrow(/robots\.txt/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("builds normally once the base is back at the root", () => {
    // Guards the guard: a throw on every call would fail the build the same way.
    expect(import.meta.env.BASE_URL).toBe("/");
    expect(absoluteUrl("/blog/", SITE_URL)).toBe("https://example.test/blog/");
  });
});

describe("assertRootDeploy", () => {
  it("accepts the only shape this site supports — root `site`, root `base`", () => {
    expect(() => assertRootDeploy(SITE_URL, "/")).not.toThrow();
  });

  it("rejects every non-root base, with or without a trailing slash", () => {
    expect(() => assertRootDeploy(SITE_URL, "/sub")).toThrow(SubpathDeployError);
    expect(() => assertRootDeploy(SITE_URL, "/sub/")).toThrow(SubpathDeployError);
    expect(() => assertRootDeploy(SITE_URL, "/a/b/")).toThrow(SubpathDeployError);
  });

  it("names the offending value, so the failure points at the line to edit", () => {
    expect(() => assertRootDeploy(SITE_URL, "/sub/")).toThrow(/"\/sub\/"/);
    expect(() => assertRootDeploy(new URL("https://example.test/sub/"), "/")).toThrow(/"\/sub\/"/);
  });

  it("treats an absent BASE_URL as the root, for callers outside a Vite build", () => {
    expect(() => assertRootDeploy(SITE_URL, undefined)).not.toThrow();
  });

  it("still rejects a path-carrying `site` when BASE_URL is absent", () => {
    // The permissive undefined default above must not switch the whole guard off: the
    // half that does not read the environment has to keep firing.
    expect(() => assertRootDeploy(new URL("https://example.test/sub/"), undefined)).toThrow(
      SubpathDeployError,
    );
  });

  it("accepts a root `site` written without a trailing slash, as astro.config.mjs writes it", () => {
    // astro.config.mjs's literal has no trailing slash; URL normalises its pathname to
    // "/", so the guard must not read the missing slash as a subpath.
    expect(() => assertRootDeploy(new URL("https://example.test"), "/")).not.toThrow();
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

// The schema cannot see an ogImage's dimensions (image() is an unresolved import
// under the glob loader), so this is the whole size-and-ratio gate.
describe("assertOgImageSize", () => {
  it("accepts the 1200x630 floor, the first asset's 1672x941 and both ratio edges", () => {
    for (const [w, h] of [[1200, 630], [1672, 941], [1600, 1000], [2100, 1000]]) {
      expect(() => assertOgImageSize(w, h, "blog → x"), `${w}x${h}`).not.toThrow();
    }
  });

  it("rejects an image under 1200x630, naming the entry", () => {
    expect(() => assertOgImageSize(1199, 630, "blog → small")).toThrow(/blog → small.*1199x630/s);
    expect(() => assertOgImageSize(1260, 629, "blog → short")).toThrow(/blog → short/);
  });

  it("rejects a ratio outside 1.6–2.1 even above the size floor", () => {
    expect(() => assertOgImageSize(1500, 1000, "projects → tall")).toThrow(/projects → tall.*1\.50:1/s);
    expect(() => assertOgImageSize(2200, 1000, "projects → wide")).toThrow(/2\.20:1/);
  });

  // A remote image() src has no dimensions; every comparison against NaN is false.
  it("fails closed on NaN, undefined or non-number dimensions", () => {
    expect(() => assertOgImageSize(NaN, NaN, "x")).toThrow(/x:/);
    expect(() => assertOgImageSize(undefined as never, undefined as never, "x")).toThrow(/x:/);
    expect(() => assertOgImageSize(1672, undefined as never, "x")).toThrow(/x:/);
    expect(() => assertOgImageSize("1672" as never, "941" as never, "x")).toThrow(/x:/);
    expect(() => assertOgImageSize(Infinity, Infinity, "x")).toThrow(/x:/);
  });
});

describe("entryOgImage", () => {
  it("rejects a remote-URL src, naming the entry, before any size check", async () => {
    await expect(
      entryOgImage({ src: "https://example.com/tiny.png" }, "blog → remote"),
    ).rejects.toThrow(/blog → remote: ogImage\.src must be a local file under src\/assets\/og\//);
  });

  it("falls back to the shared card when an entry sets no ogImage", async () => {
    expect(await entryOgImage(undefined, "blog → none")).toBe(OG_IMAGE);
  });
});

// No built page has an alt-less entry card, and publishing one would be fake content,
// so the absent-alt branch is rendered here in isolation.
describe("SeoHead image alt", () => {
  const render = async (ogImage?: Parameters<typeof SeoHead>[0]["ogImage"]) => {
    const container = await AstroContainer.create({ astroConfig: { site: SITE_URL.href } });
    const props = { title: "T", description: "D", canonicalPath: "/x/", ogImage };
    return container.renderToString(SeoHead, { props });
  };
  const card = { src: "/card.jpg", type: "image/jpeg", width: 1200, height: 630 };

  it("emits neither alt tag when the card has no alt", async () => {
    const html = await render(card);
    expect(html).toContain('property="og:image"');
    expect(html).not.toMatch(/og:image:alt|twitter:image:alt/);
  });

  it("emits both alt tags with the card's own alt when set", async () => {
    const html = await render({ ...card, alt: "Described." });
    expect(html).toContain('<meta property="og:image:alt" content="Described.">');
    expect(html).toContain('<meta name="twitter:image:alt" content="Described.">');
  });

  it("emits the shared card's alt when no card is passed", async () => {
    const html = await render();
    expect(html).toContain(`<meta property="og:image:alt" content="${OG_IMAGE.alt}">`);
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
    expect([...STATIC_SITEMAP_ROUTES]).toEqual(["/", "/blog/", "/projects/", "/about/"]);
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
