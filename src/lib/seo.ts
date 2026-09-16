// One module for the site's SEO constants and every string it builds, so the head
// block, the sitemap, the feed and robots.txt cannot disagree about a hostname, a
// title suffix or an escaping rule.
//
// No absolute hostname is written here. Every URL is derived from `site` in
// astro.config.mjs, which makes a domain change a one-line edit.

export const SITE = {
  name: "TechNoise",
  titleSuffix: " — TechNoise",
  // README's opening sentence: repo-authored fact, not invented positioning.
  description:
    "A personal blog and portfolio site, built on Astro as a static site with zero client JavaScript by default.",
  locale: "en",
  // TODO(human input): the site owner's real name and their `sameAs` profile URLs
  // (setup-guide Part 5) are human input. "TechNoise" is the persona the site
  // publishes under — a PLACEHOLDER standing in for a name, not a claim about a
  // person. Do not invent a name, and do not derive a profile URL from a project's
  // repoUrl: an identity claim in structured data is not a place to guess.
  author: { name: "TechNoise" },
} as const;

export const OG_IMAGE = {
  src: "/og/technoise-og.png",
  type: "image/png",
  width: 1200,
  height: 630,
  alt: "The TechNoise robot mascot wearing headphones, beside the TechNoise wordmark on a cream field.",
} as const;

export const RSS_PATH = "/rss.xml";
export const SITEMAP_PATH = "/sitemap.xml";

// Routes with no collection entry behind them. A new static route must be added
// here, or to the dynamic expansion in src/pages/sitemap.xml.ts, or it will not be
// in the sitemap. /styleguide/ is deliberately absent: it is noindex.
export const STATIC_SITEMAP_ROUTES: readonly string[] = ["/", "/blog/", "/projects/"];

export class MissingSiteError extends Error {
  constructor() {
    super(
      "`site` is not set. Add it to astro.config.mjs — canonical URLs, Open Graph tags, the sitemap and the feed all derive from it, and a build without it emits relative canonicals.",
    );
    this.name = "MissingSiteError";
  }
}

export function absoluteUrl(path: string, site: URL | undefined): string {
  if (!site) throw new MissingSiteError();
  // Resolved against `site` rather than concatenated, so a subpath deploy
  // (site + a matching `base`) resolves the base-prefixed pathname correctly.
  return new URL(path, site).toString();
}

export interface TrailItem {
  label: string;
  href?: string;
}

// Built from the same array the visible <Breadcrumb> renders, so structured data
// can never describe a trail the page does not show. The last item carries no
// `item`, mirroring the component's hrefless current-page entry.
export function breadcrumbList(trail: TrailItem[], site: URL | undefined): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: absoluteUrl(item.href, site) } : {}),
    })),
  };
}

export function canonicalPath(url: URL): string {
  const collapsed = `/${url.pathname}`.replace(/\/+/g, "/");
  // A path ending in a file extension is a file, not a directory: /rss.xml must not
  // grow a trailing slash.
  if (/\.[a-z0-9]+$/i.test(collapsed)) return collapsed;
  return collapsed.endsWith("/") ? collapsed : `${collapsed}/`;
}

export function pageTitle(title: string): string {
  return `${title}${SITE.titleSuffix}`;
}

export function assertMetaBudget(title: string, description: string, where: string): void {
  if (title.length > 60) {
    throw new Error(
      `${where}: <title> is ${title.length} characters, over the 60-character budget — "${title}"`,
    );
  }
  if (description.length > 155) {
    throw new Error(
      `${where}: meta description is ${description.length} characters, over the 155-character budget.`,
    );
  }
}

// `&` first: replacing it after the others would re-encode the ampersands they
// introduce, turning &lt; into &amp;lt;.
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// JSON.stringify emits the literal characters `</script>` if a value contains them,
// which closes the ld+json block and turns the rest of the payload into markup.
// Escaping `<` as < keeps the JSON valid and the tag unclosable from data.
export function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function rfc822(date: Date): string {
  return date.toUTCString();
}
