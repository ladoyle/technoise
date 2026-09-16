// One <urlset> at /sitemap.xml — not a sitemap index. docs/setup-guide.md Phase 6.2
// and the Part 4 launch checklist both name this URL, and a site with nine URLs has
// nothing to index.
//
// MAINTENANCE: this file and STATIC_SITEMAP_ROUTES are the only record of what is in
// the sitemap. A new route must be added to that registry or to the expansion below,
// or it will never be listed. /styleguide/ is absent on purpose — it is noindex.
//
// Built from src/lib/content.ts's publishing rules rather than from getCollection, so
// drafts fall out of a production build for free and the feed, the listings and this
// file cannot disagree about what "published" means.

import type { APIRoute } from "astro";

import {
  PAGE_SIZE,
  collectTags,
  getPublishedPosts,
  getPublishedProjects,
  isoDate,
  type Post,
} from "../lib/content";
import { STATIC_SITEMAP_ROUTES, absoluteUrl, escapeXml } from "../lib/seo";

interface SitemapEntry {
  path: string;
  lastmod?: Date;
}

const postDate = (post: Post): Date => post.data.updatedDate ?? post.data.pubDate;

const newestOf = (dates: Date[]): Date | undefined =>
  dates.length > 0 ? dates.reduce((a, b) => (b > a ? b : a)) : undefined;

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPublishedPosts();
  const projects = await getPublishedProjects();

  const postDates = posts.map(postDate);
  const projectDates = projects.map((project) => project.data.startDate);

  const staticLastmod: Record<string, Date | undefined> = {
    "/": newestOf([...postDates, ...projectDates]),
    "/blog/": newestOf(postDates),
    "/projects/": newestOf(projectDates),
  };

  // Page 1 is /blog/, already in the registry above.
  const pageCount = Math.ceil(posts.length / PAGE_SIZE);
  const paginated = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => {
    const pageNumber = index + 2;
    const shown = posts.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
    return { path: `/blog/${pageNumber}/`, lastmod: newestOf(shown.map(postDate)) };
  });

  const entries: SitemapEntry[] = [
    ...STATIC_SITEMAP_ROUTES.map((path) => ({ path, lastmod: staticLastmod[path] })),
    ...paginated,
    ...posts.map((post) => ({ path: `/blog/${post.id}/`, lastmod: postDate(post) })),
    ...collectTags(posts).map(({ tag }) => ({
      path: `/blog/tags/${tag}/`,
      lastmod: newestOf(posts.filter((post) => post.data.tags.includes(tag)).map(postDate)),
    })),
    ...projects.map((project) => ({
      path: `/projects/${project.id}/`,
      lastmod: project.data.startDate,
    })),
  ];

  // No changefreq and no priority: Google ignores both, and nobody can verify them.
  // No build timestamp either, so an unchanged build is byte-identical.
  const urls = entries.map((entry) => {
    const loc = `    <loc>${escapeXml(absoluteUrl(entry.path, site))}</loc>`;
    const lastmod = entry.lastmod
      ? `\n    <lastmod>${escapeXml(isoDate(entry.lastmod))}</lastmod>`
      : "";
    return `  <url>\n${loc}${lastmod}\n  </url>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
