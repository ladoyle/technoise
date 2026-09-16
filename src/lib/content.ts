// One module for the publishing rules, so five routes cannot disagree about what a
// published post is, what order posts come in, or how a date reads.

import { getCollection, type CollectionEntry } from "astro:content";

export const PAGE_SIZE = 10;

export type Post = CollectionEntry<"blog">;
export type Project = CollectionEntry<"projects">;

export interface TagCount {
  tag: string;
  count: number;
}

// Drafts stay visible under `astro dev` and disappear from the production build, so a
// half-written post can be previewed without being publishable by accident.
function isPublished(draft: boolean): boolean {
  return !draft || !import.meta.env.PROD;
}

// The title tiebreak is not decoration: two posts published on the same day would
// otherwise order differently between builds, taking the prev/next links with them.
function byNewest(aDate: Date, aTitle: string, bDate: Date, bTitle: string): number {
  const byDate = bDate.getTime() - aDate.getTime();
  return byDate !== 0 ? byDate : aTitle.localeCompare(bTitle);
}

export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection("blog", (entry) => isPublished(entry.data.draft));
  return posts.sort((a, b) =>
    byNewest(a.data.pubDate, a.data.title, b.data.pubDate, b.data.title),
  );
}

export async function getPublishedProjects(): Promise<Project[]> {
  const projects = await getCollection("projects", (entry) => isPublished(entry.data.draft));
  return projects.sort((a, b) =>
    byNewest(a.data.startDate, a.data.title, b.data.startDate, b.data.title),
  );
}

// "When did this post last change" and "when did any of them last change". Both live
// here because the sitemap's /blog/ lastmod and the feed's lastBuildDate ask that one
// question of the same posts — answering it in two files is how they drift apart.
// An item's own <pubDate> is deliberately not this: an edit must not re-notify every
// subscriber by moving the date the post was published.
export function postDate(post: Post): Date {
  return post.data.updatedDate ?? post.data.pubDate;
}

export function newestOf(dates: Date[]): Date | undefined {
  return dates.length > 0 ? dates.reduce((a, b) => (b > a ? b : a)) : undefined;
}

const WORDS_PER_MINUTE = 200;

export function readingMinutes(body: string | undefined): number {
  const words = (body ?? "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function collectTags(posts: Post[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tag, count]): TagCount => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// timeZone is required. YAML dates parse to UTC midnight, and a build machine behind
// UTC would otherwise render every post as the day before it was published.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
