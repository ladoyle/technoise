import { afterEach, describe, expect, it, vi } from "vitest";

// getCollection is the only thing these helpers take from Astro, so mocking it lets the
// draft rule and the sort order be tested without a build.
const entries: { blog: FakeEntry[]; projects: FakeEntry[] } = { blog: [], projects: [] };

interface FakeEntry {
  id: string;
  data: { title: string; draft: boolean; pubDate?: Date; startDate?: Date };
}

vi.mock("astro:content", () => ({
  getCollection: async (name: "blog" | "projects", filter?: (e: FakeEntry) => boolean) =>
    entries[name].filter((e) => (filter ? filter(e) : true)),
}));

const { getPublishedPosts, getPublishedProjects } = await import("../src/lib/content");

function blogEntry(id: string, title: string, pubDate: string, draft = false): FakeEntry {
  return { id, data: { title, draft, pubDate: new Date(pubDate) } };
}

function projectEntry(id: string, title: string, startDate: string, draft = false): FakeEntry {
  return { id, data: { title, draft, startDate: new Date(startDate) } };
}

afterEach(() => {
  entries.blog = [];
  entries.projects = [];
  vi.unstubAllEnvs();
});

describe("getPublishedPosts", () => {
  it("sorts newest first", async () => {
    entries.blog = [
      blogEntry("old", "Old", "2026-01-01"),
      blogEntry("new", "New", "2026-09-01"),
      blogEntry("mid", "Mid", "2026-05-01"),
    ];
    expect((await getPublishedPosts()).map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("breaks a same-day tie on title so prev/next links are stable between builds", async () => {
    entries.blog = [
      blogEntry("zulu", "Zulu", "2026-09-15"),
      blogEntry("alpha", "Alpha", "2026-09-15"),
      blogEntry("mike", "Mike", "2026-09-15"),
    ];
    const first = (await getPublishedPosts()).map((p) => p.id);
    entries.blog.reverse();
    const second = (await getPublishedPosts()).map((p) => p.id);
    expect(first).toEqual(["alpha", "mike", "zulu"]);
    expect(second).toEqual(first);
  });

  it("keeps drafts out of a production build", async () => {
    vi.stubEnv("PROD", true);
    entries.blog = [blogEntry("live", "Live", "2026-09-01"), blogEntry("wip", "WIP", "2026-09-02", true)];
    expect((await getPublishedPosts()).map((p) => p.id)).toEqual(["live"]);
  });

  it("keeps drafts visible outside a production build, so astro dev can preview them", async () => {
    vi.stubEnv("PROD", false);
    entries.blog = [blogEntry("live", "Live", "2026-09-01"), blogEntry("wip", "WIP", "2026-09-02", true)];
    expect((await getPublishedPosts()).map((p) => p.id)).toEqual(["wip", "live"]);
  });
});

describe("getPublishedProjects", () => {
  it("sorts by startDate descending with the same title tiebreak", async () => {
    entries.projects = [
      projectEntry("b", "Beta", "2026-01-01"),
      projectEntry("a", "Alpha", "2026-01-01"),
      projectEntry("c", "Gamma", "2026-06-01"),
    ];
    expect((await getPublishedProjects()).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("applies the same draft rule as posts", async () => {
    vi.stubEnv("PROD", true);
    entries.projects = [
      projectEntry("shown", "Shown", "2026-01-01"),
      projectEntry("hidden", "Hidden", "2026-02-01", true),
    ];
    expect((await getPublishedProjects()).map((p) => p.id)).toEqual(["shown"]);
  });
});

// The loader's `**/*.md` pattern collects nested files, but an entry id is one URL
// segment. Astro's own failure for a nested id is `TypeError: Missing parameter: slug`,
// which names no file — these pin the message that replaces it.
describe("routable-id guard", () => {
  it("rejects a nested post, naming the offending id and the directory rule", async () => {
    entries.blog = [
      blogEntry("flat-post", "Flat", "2026-01-01"),
      blogEntry("2026/inner-post", "Inner", "2026-02-01"),
    ];
    await expect(getPublishedPosts()).rejects.toThrow(
      /blog entry "2026\/inner-post" is in a subdirectory.*src\/content\/blog\//s,
    );
  });

  it("rejects a nested project with the projects collection named", async () => {
    entries.projects = [
      projectEntry("flat-project", "Flat", "2026-01-01"),
      projectEntry("archive/old-thing", "Old", "2026-02-01"),
    ];
    await expect(getPublishedProjects()).rejects.toThrow(
      /projects entry "archive\/old-thing" is in a subdirectory.*src\/content\/projects\//s,
    );
  });

  it("still rejects a bare-number post slug, now from the same guard", async () => {
    entries.blog = [blogEntry("2026", "Numeric", "2026-01-01")];
    await expect(getPublishedPosts()).rejects.toThrow(
      'Post slug "2026" is a bare number and collides with the /blog/<n>/ pagination URLs. Rename the file.',
    );
  });

  it("leaves a numeric project id alone — projects have no paginated listing", async () => {
    entries.projects = [projectEntry("2026", "Numeric", "2026-01-01")];
    expect((await getPublishedProjects()).map((p) => p.id)).toEqual(["2026"]);
  });

  // The guard runs on the entries that survive the draft filter, so a nested draft is
  // checked exactly where it is reachable: under astro dev, which renders drafts. A
  // production build never routes it, so it cannot be the thing that breaks a deploy.
  it("rejects a nested draft under astro dev and ignores it in a production build", async () => {
    entries.blog = [blogEntry("2026/wip", "WIP", "2026-01-01", true)];

    vi.stubEnv("PROD", false);
    await expect(getPublishedPosts()).rejects.toThrow(
      /blog entry "2026\/wip" is in a subdirectory/,
    );

    vi.stubEnv("PROD", true);
    expect(await getPublishedPosts()).toEqual([]);
  });

  it("accepts a flat hyphenated id in either collection", async () => {
    entries.blog = [blogEntry("a-colour-system-that-passes", "Colour", "2026-01-01")];
    entries.projects = [projectEntry("technoise-site", "Site", "2026-01-01")];
    expect((await getPublishedPosts()).map((p) => p.id)).toEqual([
      "a-colour-system-that-passes",
    ]);
    expect((await getPublishedProjects()).map((p) => p.id)).toEqual(["technoise-site"]);
  });
});
