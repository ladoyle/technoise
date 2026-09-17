import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// Issue #21: no workflow ran `npm test` or `astro check`, and nothing had a
// `pull_request` trigger at all, so PR #20 opened with zero check runs. The resume
// privacy guard in nav-contract.test.ts was the stated enforcement mechanism for a hard
// requirement — no phone number, no city or state on /resume/ — and only ever ran when
// someone remembered to run it locally.
//
// workflow-permissions.test.ts already covers ci.yml for permission scoping and action
// pinning, because its `it.each` walks every file in .github/workflows/. What nothing
// covered is the property #21 actually bought: that this workflow runs the suite, on
// pull requests, under a job name branch protection can bind to. A workflow file is not
// type checked, not built and not linted, so dropping the `npm test` step or the
// `pull_request` trigger would reopen #21 in silence — green PRs, guard never fired.

const root = fileURLToPath(new URL("..", import.meta.url));
const ciPath = join(root, ".github", "workflows", "ci.yml");
const deployPath = join(root, ".github", "workflows", "deploy.yml");

type Step = { uses?: string; run?: string; with?: Record<string, string> };
type Workflow = {
  on?: { pull_request?: unknown; push?: { branches?: string[] } };
  jobs: Record<string, { "runs-on"?: string; steps?: Step[] }>;
};

const source = readFileSync(ciPath, "utf8");
// YAML 1.2, matching what GitHub Actions reads. Under YAML 1.1 (PyYAML) the `on:` key
// parses as the boolean `true` instead, so a YAML 1.1 parser would find no trigger here.
const ci = parse(source) as Workflow;
const deploy = parse(readFileSync(deployPath, "utf8")) as Workflow;

const nvmrcMajor = (): string =>
  readFileSync(join(root, ".nvmrc"), "utf8").trim().replace(/^v/, "");

const runCommands = (): string[] =>
  (ci.jobs.verify.steps ?? [])
    .map((step) => step.run)
    .filter((run): run is string => typeof run === "string")
    .map((run) => run.trim().replace(/\s+/g, " "));

describe("CI workflow runs the checks on the path to production", () => {
  it("defines a job named verify", () => {
    // Branch protection binds a required status check by job name. Renaming this job
    // silently unbinds that requirement, which is the half of #21 that repo settings own.
    expect(Object.keys(ci.jobs)).toContain("verify");
  });

  it("triggers on every pull request", () => {
    // The key must be present; its value is null (`pull_request:` with no filters), which
    // means all branches and the default opened/synchronize/reopened types. `in` rather
    // than a truthiness check, because null is exactly the passing shape here.
    expect(ci.on).toBeDefined();
    expect("pull_request" in (ci.on ?? {})).toBe(true);
  });

  it("also triggers on push to master, so the merge commit itself is checked", () => {
    expect(ci.on?.push?.branches).toContain("master");
  });

  it("runs the type check and the test suite, installing from the lockfile", () => {
    // Exact command set and order: install before either gate, and both gates present.
    // `npm test` is the assertion that closes #21 — the privacy guard runs here or nowhere.
    expect(runCommands()).toEqual(["npm ci", "npx astro check", "npm test"]);
  });

  it("takes the Node version from .nvmrc rather than a second literal", () => {
    const setupNode = (ci.jobs.verify.steps ?? []).find((step) =>
      step.uses?.startsWith("actions/setup-node@"),
    );
    expect(setupNode?.with?.["node-version-file"]).toBe(".nvmrc");
    // `cache: npm` keys off the committed lockfile; without package-lock.json the step
    // fails outright rather than silently skipping the cache.
    expect(setupNode?.with?.cache).toBe("npm");
  });

  it("keeps .nvmrc satisfying the engines floor in package.json", () => {
    // Two files pin Node for different readers (CI via .nvmrc, npm via engines). They are
    // allowed to differ, but not to contradict — .nvmrc must not drift below the floor.
    const engines = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).engines.node;
    const floor = /(\d+)\.(\d+)\.(\d+)/.exec(engines);
    expect(floor, `engines.node "${engines}" is not a plain >=x.y.z range`).not.toBeNull();
    expect(Number(nvmrcMajor().split(".")[0])).toBeGreaterThanOrEqual(Number(floor![1]));
  });

  it("builds the deployed artifact on the Node version .nvmrc names", () => {
    // Gatekeeper audit G4: withastro/action runs its own actions/setup-node from its own
    // `node-version` default (`"24"` at the pinned SHA — it matches .nvmrc today, but by
    // coincidence, and a SHA bump can move it). Passing it explicitly means `verify` and
    // the artifact that reaches Pages agree on a major. The action takes a version string,
    // not a version file, so this is the second literal — pinned here rather than trusted.
    const astroAction = (deploy.jobs.build.steps ?? []).find((step) =>
      step.uses?.startsWith("withastro/action@"),
    );
    expect(astroAction, "deploy.yml no longer runs withastro/action").toBeDefined();
    expect(String(astroAction?.with?.["node-version"])).toBe(nvmrcMajor());
  });

  it("references no secret", () => {
    // A pull_request-triggered workflow checks out the merge ref of untrusted code. It has
    // no reason to hold a secret, and must not acquire one without that being a deliberate,
    // reviewed change.
    expect(source).not.toMatch(/secrets\./);
  });
});
