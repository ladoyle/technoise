// One module for the site's SEO constants and every string it builds, so the head
// block, the sitemap, the feed and robots.txt cannot disagree about a hostname, a
// title suffix or an escaping rule.
//
// No absolute hostname is written here. Every URL is derived from `site` in
// astro.config.mjs, which makes a domain change a one-line edit. That host must serve
// the site at its root — a subpath deploy is unsupported and fails the build; see
// assertRootDeploy below.

export const SITE = {
  name: "TechNoise",
  titleSuffix: " — TechNoise",
  // README's opening sentence: repo-authored fact, not invented positioning.
  description:
    "A personal blog and portfolio site, built on Astro as a static site with zero client JavaScript by default.",
  locale: "en",
  // The site owner's real identity, supplied as human input (setup-guide Part 5) —
  // used as the `Person` behind the WebSite entity on the home page, and as
  // `author` on every post and project. "TechNoise" (above) stays the publishing
  // persona; this is the person behind it. `sameAs` carries only profile links
  // supplied — no other profile URL is invented or derived from a project's
  // repoUrl.
  author: {
    name: "Luke Doyle",
    sameAs: ["https://www.linkedin.com/in/luke-doyle-116b58160", "https://github.com/ladoyle"],
  },
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
// in the sitemap. Two deliberate exclusions, both noindex, for different reasons:
// /styleguide/ is real content nobody searched for, and /404.html is not content at
// all — a static host cannot pair it with a real 404 status, so listing it would
// register a soft 404. tests/discovery-output.test.ts enforces the general rule that
// a sitemap entry and a noindex tag contradict each other.
export const STATIC_SITEMAP_ROUTES: readonly string[] = [
  "/",
  "/blog/",
  "/projects/",
  "/resume/",
];

export class MissingSiteError extends Error {
  constructor() {
    super(
      "`site` is not set. Add it to astro.config.mjs — canonical URLs, Open Graph tags, the sitemap and the feed all derive from it, and a build without it emits relative canonicals.",
    );
    this.name = "MissingSiteError";
  }
}

export class SubpathDeployError extends Error {
  constructor(detail: string) {
    super(
      `${detail} This site is built for a root deploy only: every URL here is a rooted path resolved against \`site\`, so a subpath is dropped from every canonical, og:image, sitemap <loc>, RSS link/guid and JSON-LD @id, and robots.txt lands off the origin root — the only place a crawler reads it. Serve the site at the root of its own host (docs/setup-guide.md Phase 5 attaches a custom domain), or teach src/lib/seo.ts to prefix the base before setting one.`,
    );
    this.name = "SubpathDeployError";
  }
}

// Both halves of a subpath deploy are rejected, because neither works and both fail
// silently: `new URL("/blog/", site)` discards a path already in `site`, and a
// configured `base` never reaches these rooted literals at all. Failing the build is
// the honest outcome until someone actually needs a subpath and prefixes the base here.
export function assertRootDeploy(
  site: URL,
  base: string | undefined = import.meta.env.BASE_URL,
): void {
  if (base !== undefined && base !== "/") {
    throw new SubpathDeployError(`\`base\` in astro.config.mjs is "${base}", not "/".`);
  }
  if (site.pathname !== "/") {
    throw new SubpathDeployError(`\`site\` in astro.config.mjs carries the path "${site.pathname}".`);
  }
}

export function absoluteUrl(path: string, site: URL | undefined): string {
  if (!site) throw new MissingSiteError();
  assertRootDeploy(site);
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
  const collapsed = url.pathname.replace(/\/+/g, "/");
  // A path ending in a file extension is a file, not a directory: /rss.xml must not
  // grow a trailing slash. No page route reaches this branch: astro.config.mjs leaves
  // build.format at its "directory" default, so a resolved page pathname always ends
  // in "/". The guard is here for the non-page paths the helper's unit tests pass it.
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
