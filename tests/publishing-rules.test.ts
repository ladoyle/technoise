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
