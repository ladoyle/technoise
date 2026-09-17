import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// Issue #14: `deploy.yml` granted `pages: write` and `id-token: write` at workflow level,
// so the `build` job — the one that runs a third-party action — held both. The fix scopes
// each grant to the job that needs it and pins the third-party action to a commit SHA.
//
// Neither property is checked by anything else in this repo: a workflow file is not type
// checked, not built, and not linted, so the failure mode is silent drift. Two specific
// regressions these assertions exist to catch: someone "tidying" the workflow-level
// `permissions: {}` away (harmless today, but the next job added without its own block
// then inherits the repo default), and someone bumping `withastro/action` back to a
// mutable tag while updating it.

const root = fileURLToPath(new URL("..", import.meta.url));
const workflowDir = join(root, ".github", "workflows");

type Job = {
  permissions?: Record<string, string>;
  steps?: { id?: string; uses?: string }[];
  environment?: { name?: string; url?: string };
  needs?: string | string[];
};

type Workflow = {
  permissions?: Record<string, string> | string;
  jobs: Record<string, Job>;
};

const workflowFiles = readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name));

const source = (file: string) => readFileSync(join(workflowDir, file), "utf8");
const workflow = (file: string) => parse(source(file)) as Workflow;

// A `uses:` ref is "third party" when its owner is not GitHub's own `actions` org. Local
// (`./…`) and container (`docker://…`) refs are neither, and are not pinned by SHA.
const thirdPartyUses = (file: string): { line: number; text: string; ref: string }[] =>
  source(file)
    .split("\n")
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => /^\s*-?\s*uses:\s*\S/.test(text))
    .map(({ text, line }) => ({ text, line, ref: /uses:\s*(\S+)/.exec(text)![1] }))
    .filter(({ ref }) => !ref.startsWith("./") && !ref.startsWith("docker://"))
    .filter(({ ref }) => !ref.startsWith("actions/"));

describe("deploy workflow permissions", () => {
  it("finds the deploy workflow", () => {
    expect(workflowFiles).toContain("deploy.yml");
  });

  it("grants nothing at workflow level", () => {
    // `permissions: {}` parses to an empty object; a missing key parses to undefined and
    // means "repo default", which is what Issue #14 was about.
    expect(workflow("deploy.yml").permissions).toEqual({});
  });

  it("gives the build job contents: read and nothing else", () => {
    // Exact equality, not a subset check: a job-level block replaces the default token
    // permissions wholesale, so this asserts the other fifteen scopes are `none`.
    expect(workflow("deploy.yml").jobs.build.permissions).toEqual({ contents: "read" });
  });

  it("gives the deploy job exactly the two scopes deploy-pages documents", () => {
    expect(workflow("deploy.yml").jobs.deploy.permissions).toEqual({
      "pages": "write",
      "id-token": "write",
    });
  });

  it("keeps the deploy job free of third-party steps", () => {
    // The permission split is only worth anything while `deploy` — the job holding the
    // write scopes — runs nothing but GitHub's own action.
    const uses = (workflow("deploy.yml").jobs.deploy.steps ?? []).map((step) => step.uses);
    expect(uses).toEqual(["actions/deploy-pages@v4"]);
  });

  it("wires deploy to the build artifact and the github-pages environment", () => {
    const deploy = workflow("deploy.yml").jobs.deploy;
    // Without `needs`, deploy-pages runs before the artifact exists. It finds the artifact
    // through the Actions results service (runtime token, no GITHUB_TOKEN scope), so the
    // ordering edge is the only thing that makes it available — there is no download step
    // to notice its absence.
    expect(deploy.needs).toBe("build");
    expect(deploy.environment?.name).toBe("github-pages");
    // The environment URL reads an output off a step that has to exist by that id.
    const referenced = /steps\.([A-Za-z0-9_-]+)\.outputs\.page_url/.exec(
      deploy.environment?.url ?? "",
    )?.[1];
    expect(referenced).toBeDefined();
    expect((deploy.steps ?? []).map((step) => step.id)).toContain(referenced);
  });
});

describe("workflow permission hygiene", () => {
  it.each(workflowFiles)("%s declares permissions on every job", (file) => {
    for (const [name, job] of Object.entries(workflow(file).jobs)) {
      expect(job.permissions, `job "${name}" declares no permissions block`).toBeDefined();
    }
  });

  it.each(workflowFiles)("%s keeps pages and id-token off every other job", (file) => {
    for (const [name, job] of Object.entries(workflow(file).jobs)) {
      if (name === "deploy") continue;
      expect(Object.keys(job.permissions ?? {}), `job "${name}"`).not.toContain("pages");
      expect(Object.keys(job.permissions ?? {}), `job "${name}"`).not.toContain("id-token");
    }
  });
});

describe("third-party action pinning", () => {
  it("has a third-party action to check", () => {
    // If this ever legitimately drops to zero the assertions below pass vacuously, so
    // fail loudly instead of reporting green on an empty set.
    expect(thirdPartyUses("deploy.yml").map(({ ref }) => ref)).toEqual([
      expect.stringMatching(/^withastro\/action@/),
    ]);
  });

  it.each(workflowFiles)("%s pins every third-party action to a commit SHA", (file) => {
    for (const { ref, line } of thirdPartyUses(file)) {
      const pin = ref.split("@")[1] ?? "";
      expect(pin, `${file}:${line} — ${ref} is not a 40-char commit SHA`).toMatch(
        /^[0-9a-f]{40}$/,
      );
    }
  });

  it.each(workflowFiles)("%s records the pinned version in a trailing comment", (file) => {
    for (const { text, line } of thirdPartyUses(file)) {
      // A bare SHA is unreadable and unbumpable; the comment is what makes the pin
      // maintainable, so it is part of the acceptance criteria, not decoration.
      expect(text, `${file}:${line} has no "# vX.Y.Z" comment`).toMatch(/#\s*v\d+(\.\d+)*\s*$/);
    }
  });
});
