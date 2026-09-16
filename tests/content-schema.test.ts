import { describe, expect, it } from "vitest";

import { collections } from "../src/content.config";

// defineCollection keeps the zod object it was handed, so the build-time contract can
// be exercised directly instead of only through a full `astro build`.
const blog = collections.blog.schema as unknown as {
  safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } };
};
const projects = collections.projects.schema as unknown as {
  safeParse: (v: unknown) => {
    success: boolean;
    data?: Record<string, unknown>;
    error?: { issues: { message: string }[] };
  };
};

const validPost = {
  title: "A colour system that passes",
  description: "One sentence.",
  pubDate: "2026-09-15",
  tags: ["accessibility", "design-systems"],
};

const validProject = {
  title: "The TechNoise site",
  description: "One sentence.",
  stack: ["Astro"],
  startDate: "2026-09-01",
};

function messages(result: { error?: { issues: { message: string }[] } }): string {
  return (result.error?.issues ?? []).map((i) => i.message).join(" | ");
}

describe("blog schema", () => {
  it("accepts a well-formed entry and defaults draft to false", () => {
    const result = blog.safeParse(validPost) as { success: boolean; data?: { draft: boolean } };
    expect(result.success).toBe(true);
    expect(result.data?.draft).toBe(false);
  });

  it("rejects a missing description — the meta description cannot be optional", () => {
    const { description, ...withoutDescription } = validPost;
    expect(description).toBeTypeOf("string");
    expect(blog.safeParse(withoutDescription).success).toBe(false);
  });

  it("enforces the 48-character title cap that keeps <title> within 60", () => {
    expect(blog.safeParse({ ...validPost, title: "x".repeat(48) }).success).toBe(true);
    const tooLong = blog.safeParse({ ...validPost, title: "x".repeat(49) });
    expect(tooLong.success).toBe(false);
    expect(messages(tooLong)).toMatch(/48 characters/);
  });

  it("enforces the 155-character description cap", () => {
    expect(blog.safeParse({ ...validPost, description: "x".repeat(155) }).success).toBe(true);
    expect(blog.safeParse({ ...validPost, description: "x".repeat(156) }).success).toBe(false);
  });

  it("rejects an empty title or description rather than rendering a blank page", () => {
    expect(blog.safeParse({ ...validPost, title: "" }).success).toBe(false);
    expect(blog.safeParse({ ...validPost, description: "" }).success).toBe(false);
  });

  it("accepts only lowercase hyphenated tags", () => {
    for (const tag of ["astro", "design-systems", "a11y", "css3"]) {
      expect(blog.safeParse({ ...validPost, tags: [tag] }).success, tag).toBe(true);
    }
    for (const tag of ["Astro", "design systems", "-astro", "astro-", "design--systems", "astro_2", ""]) {
      expect(blog.safeParse({ ...validPost, tags: [tag] }).success, tag).toBe(false);
    }
  });

  it("caps a tag at 24 characters so the archive title stays under 60", () => {
    expect(blog.safeParse({ ...validPost, tags: ["a".repeat(24)] }).success).toBe(true);
    expect(blog.safeParse({ ...validPost, tags: ["a".repeat(25)] }).success).toBe(false);
  });

  it("requires between one and four tags", () => {
    expect(blog.safeParse({ ...validPost, tags: [] }).success).toBe(false);
    expect(blog.safeParse({ ...validPost, tags: ["a", "b", "c", "d"] }).success).toBe(true);
    expect(blog.safeParse({ ...validPost, tags: ["a", "b", "c", "d", "e"] }).success).toBe(false);
  });

  it("coerces YAML dates to Date objects at UTC midnight", () => {
    const result = blog.safeParse(validPost) as { success: boolean; data?: { pubDate: Date } };
    expect(result.data?.pubDate).toBeInstanceOf(Date);
    expect(result.data?.pubDate.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("rejects an updatedDate earlier than pubDate and allows an equal one", () => {
    const earlier = blog.safeParse({ ...validPost, updatedDate: "2026-09-14" });
    expect(earlier.success).toBe(false);
    expect(messages(earlier)).toMatch(/updatedDate cannot be earlier/);
    expect(blog.safeParse({ ...validPost, updatedDate: "2026-09-15" }).success).toBe(true);
    expect(blog.safeParse({ ...validPost, updatedDate: "2026-09-16" }).success).toBe(true);
  });
});

describe("projects schema", () => {
  it("accepts a well-formed entry and defaults status and draft", () => {
    const result = projects.safeParse(validProject);
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("in-progress");
    expect(result.data?.draft).toBe(false);
  });

  it("accepts only the three honest status values", () => {
    for (const status of ["in-progress", "shipped", "archived"]) {
      expect(projects.safeParse({ ...validProject, status }).success, status).toBe(true);
    }
    expect(projects.safeParse({ ...validProject, status: "live" }).success).toBe(false);
  });

  it("requires one to six non-empty stack entries", () => {
    expect(projects.safeParse({ ...validProject, stack: [] }).success).toBe(false);
    expect(projects.safeParse({ ...validProject, stack: [""] }).success).toBe(false);
    expect(projects.safeParse({ ...validProject, stack: Array(6).fill("x") }).success).toBe(true);
    expect(projects.safeParse({ ...validProject, stack: Array(7).fill("x") }).success).toBe(false);
  });

  it("rejects a demoUrl or repoUrl that is not a URL", () => {
    expect(projects.safeParse({ ...validProject, repoUrl: "github.com/ladoyle" }).success).toBe(false);
    expect(projects.safeParse({ ...validProject, demoUrl: "not a url" }).success).toBe(false);
    expect(
      projects.safeParse({ ...validProject, repoUrl: "https://github.com/ladoyle/technoise" }).success,
    ).toBe(true);
  });

  it("treats both action URLs as optional, which is the no-action-row case", () => {
    const result = projects.safeParse(validProject);
    expect(result.success).toBe(true);
    expect(result.data?.demoUrl).toBeUndefined();
    expect(result.data?.repoUrl).toBeUndefined();
  });

  it("allows a project title up to the same 48-character cap", () => {
    expect(projects.safeParse({ ...validProject, title: "x".repeat(49) }).success).toBe(false);
  });
});
