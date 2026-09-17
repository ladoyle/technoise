// Generated rather than committed to public/, because the sitemap line has to be an
// absolute URL and the hostname is not settled yet. Deriving it from `site` makes a
// domain change a one-line edit in astro.config.mjs instead of a stale literal.
//
// Crawlers read robots.txt at the origin root and nowhere else, so this route only
// works on a root deploy. A configured `base` would move it to /<base>/robots.txt;
// assertRootDeploy in src/lib/seo.ts fails that build rather than emitting a file
// nothing will ever fetch.
//
// No Disallow lines. A path blocked from crawling can never be read as noindex,
// which is the standard way pages end up indexed after being told not to be;
// /styleguide/ carries its own noindex instead.

import type { APIRoute } from "astro";

import { SITEMAP_PATH, absoluteUrl } from "../lib/seo";

export const GET: APIRoute = async ({ site }) => {
  const body = `User-agent: *
Allow: /

Sitemap: ${absoluteUrl(SITEMAP_PATH, site)}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
