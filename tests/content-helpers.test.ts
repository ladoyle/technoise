import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  collectTags,
  formatDate,
  isoDate,
  newestOf,
  postDate,
  readingMinutes,
  type Post,
} from "../src/lib/content";

// A Post is a CollectionEntry<'blog'>; these tests only touch the fields the helpers
// read, so a narrow cast keeps the fixtures readable.
function post(title: string, tags: string[], pubDate = "2026-01-01"): Post {
  return {
    id: title.toLowerCase().replaceAll(" ", "-"),
    collection: "blog",
    data: {
      title,
      description: "d",
      pubDate: new Date(pubDate),
      tags,
      draft: false,
    },
  } as unknown as Post;
}

describe("PAGE_SIZE", () => {
  it("is the single source of the blog page size", () => {
    expect(PAGE_SIZE).toBe(10);
  });
});

describe("readingMinutes", () => {
  it("returns at least one minute for an empty or undefined body", () => {
    expect(readingMinutes(undefined)).toBe(1);
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("   \n\t  ")).toBe(1);
  });

  it("rounds up rather than down", () => {
    expect(readingMinutes("word ".repeat(201))).toBe(2);
    expect(readingMinutes("word ".repeat(200))).toBe(1);
    expect(readingMinutes("word ".repeat(401))).toBe(3);
  });

  it("counts whitespace-separated tokens, collapsing runs of whitespace", () => {
    // 200 wpm, so 600 tokens is exactly 3 minutes however they are separated.
    const spaced = Array.from({ length: 600 }, () => "w").join("   \n  ");
    expect(readingMinutes(spaced)).toBe(3);
  });

  it("does not count leading or trailing whitespace as a word", () => {
    expect(readingMinutes("  one two  ")).toBe(1);
  });
});

describe("collectTags", () => {
  it("counts each tag once per post", () => {
    const tags = collectTags([
      post("A", ["astro", "meta"]),
      post("B", ["astro"]),
      post("C", ["css"]),
    ]);
    expect(tags).toEqual([
      { tag: "astro", count: 2 },
      { tag: "css", count: 1 },
      { tag: "meta", count: 1 },
    ]);
  });

  it("sorts by count descending, then tag ascending", () => {
    const tags = collectTags([
      post("A", ["zebra", "alpha"]),
      post("B", ["zebra", "alpha"]),
      post("C", ["beta"]),
    ]);
    expect(tags.map((t) => t.tag)).toEqual(["alpha", "zebra", "beta"]);
  });

  it("returns an empty list for no posts, so the tag nav can be omitted", () => {
    expect(collectTags([])).toEqual([]);
  });
});

describe("formatDate", () => {
  it("formats in en-GB long form", () => {
    expect(formatDate(new Date("2026-09-15T00:00:00Z"))).toBe("15 September 2026");
  });

  it("stays on the authored day regardless of the build machine's timezone", () => {
    // YAML dates parse to UTC midnight. Without timeZone: 'UTC' a build in a
    // behind-UTC zone renders the previous day.
    expect(formatDate(new Date("2026-01-01T00:00:00Z"))).toBe("1 January 2026");
    expect(formatDate(new Date("2026-03-01T00:00:00Z"))).toBe("1 March 2026");
  });
});

describe("isoDate", () => {
  it("emits the YYYY-MM-DD form <time datetime> needs", () => {
    expect(isoDate(new Date("2026-09-15T00:00:00Z"))).toBe("2026-09-15");
    expect(isoDate(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
  });
});

// The sitemap's <lastmod> and the feed's <lastBuildDate> both route "when did this
// last change" through these two. discovery-output.test.ts asserts the two artifacts
// agree with each other, which cannot catch the rule itself changing underneath both
// at once — these assert the rule directly, at the one place it is now written.
function dated(pubDate: string, updatedDate?: string): Post {
  return {
    id: "a-post",
    collection: "blog",
    data: {
      title: "A post",
      description: "d",
      pubDate: new Date(pubDate),
      ...(updatedDate ? { updatedDate: new Date(updatedDate) } : {}),
      tags: ["meta"],
      draft: false,
    },
  } as unknown as Post;
}

describe("postDate", () => {
  it("falls back to pubDate when a post was never edited", () => {
    expect(postDate(dated("2026-09-15")).toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("prefers updatedDate, so a same-day edit to an older post is not understated", () => {
    expect(postDate(dated("2026-09-15", "2026-09-20")).toISOString()).toBe(
      "2026-09-20T00:00:00.000Z",
    );
  });

  it("honours an updatedDate even when it predates pubDate, rather than silently clamping", () => {
    // Not a valid authoring state, but the helper must not invent a max(): the
    // sitemap and feed should surface bad frontmatter, not paper over it.
    expect(postDate(dated("2026-09-15", "2026-09-10")).toISOString()).toBe(
      "2026-09-10T00:00:00.000Z",
    );
  });
});

describe("newestOf", () => {
  it("returns undefined for no dates, so the caller omits the element entirely", () => {
    expect(newestOf([])).toBeUndefined();
  });

  it("returns the single date unchanged", () => {
    expect(newestOf([new Date("2026-09-15")])?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("returns the newest regardless of input order", () => {
    const dates = [new Date("2026-09-15"), new Date("2026-09-20"), new Date("2026-01-01")];
    expect(newestOf(dates)?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(newestOf([...dates].reverse())?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("does not mutate the array it is given", () => {
    const dates = [new Date("2026-09-15"), new Date("2026-09-20"), new Date("2026-01-01")];
    newestOf(dates);
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-09-15",
      "2026-09-20",
      "2026-01-01",
    ]);
  });
});
