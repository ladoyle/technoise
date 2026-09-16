// RSS 2.0 for blog posts. Projects are portfolio entries, not feed items.
//
// Items carry the frontmatter description, not rendered post HTML: a full-content
// feed would need Markdown rendering plus HTML sanitisation in the feed path, which
// is a dependency and a security surface this phase is not taking on.
//
// Every interpolated value goes through escapeXml. A title containing & or < is
// valid content and must not be able to produce an invalid feed.

import type { APIRoute } from "astro";

import { getPublishedPosts } from "../lib/content";
import { RSS_PATH, SITE, absoluteUrl, escapeXml, rfc822 } from "../lib/seo";

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPublishedPosts();
  const home = absoluteUrl("/", site);

  const items = posts.map((post) => {
    const link = absoluteUrl(`/blog/${post.id}/`, site);
    const categories = post.data.tags
      .map((tag) => `\n      <category>${escapeXml(tag)}</category>`)
      .join("");

    return `    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${escapeXml(rfc822(post.data.pubDate))}</pubDate>
      <description>${escapeXml(post.data.description)}</description>${categories}
    </item>`;
  });

  // The newest post's date, never the build time: an unchanged build produces a
  // byte-identical feed.
  const lastBuildDate = posts[0]
    ? `\n    <lastBuildDate>${escapeXml(rfc822(posts[0].data.pubDate))}</lastBuildDate>`
    : "";

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.name)}</title>
    <link>${escapeXml(home)}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>${escapeXml(SITE.locale)}</language>${lastBuildDate}
    <atom:link href="${escapeXml(absoluteUrl(RSS_PATH, site))}" rel="self" type="application/rss+xml" />
${items.join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
