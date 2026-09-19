# TechNoise — Agent Contract

Every agent reads this file before doing anything else. It is the single source of truth for
development style, workflow, and handoffs. Where this file and a prompt disagree, ask rather
than guess.

This file states **rules**. The reasoning behind them lives in linked docs, which you read
only when you are touching that area:

| Doc | Read it before |
|---|---|
| [`docs/setup-guide.md`](docs/setup-guide.md) | Planning work — the design plan and phase roadmap |
| [`docs/testing.md`](docs/testing.md) | Adding or changing a test, or debugging the harness |
| [`docs/brand-assets.md`](docs/brand-assets.md) | Touching a brand SVG, the favicon, the header mark, or a `-dim` token |
| [`docs/infrastructure.md`](docs/infrastructure.md) | Touching a workflow, `public/`, `archive/`, the `48em` hinge, or a dependency |

Keep it that way. Narrative that belongs in a doc must not be inlined here — this file is
reloaded into every agent's context on every cycle, and length is a real cost.

---

## Pick the path first

Before running anything, classify the request. There are two paths and the wrong one is
expensive in both directions.

### Quick tweak — direct edit, no pipeline, no reports

Handle it yourself, in the session, against the rules in this file. **Do not spawn agents.
Do not write a report.** Reports exist to carry state between stages; with no stages there
is no state to carry.

A request qualifies when **all** of these hold:

- **Singular** — one coherent change, not a list of independent ones.
- **Non-structural** — no new route, component, dependency, schema field, workflow, or
  public API; no change to a file's role or to how the build resolves anything.
- **Covered by existing tests** — the current suite would catch a regression. You are not
  writing a new test to make the change safe.
- **Reversible** — a single revert undoes it cleanly.

Typical members: a token value change, a copy edit, a spacing or type-scale swap (on-scale),
a dark-mode tint adjustment, an `alt` text fix, a doc correction, a one-line helper fix with
a test already over it.

The quick-tweak procedure, in full:

1. Make the edit on a `feature/<short-slug>` branch.
2. Run `npx astro check` and `npm test`. Both must pass.
3. For anything visible, look at the result — 320px and 1440px, light and dark.
4. Commit, push, and tell the human what changed in a few sentences in chat.

That chat summary replaces the report. If the change turns out to need a second file, a new
test, or a judgement you can't make from this file, **stop and escalate to the full
pipeline** rather than growing the tweak.

### Full pipeline — structural change

Everything else: new pages or components, schema or config changes, dependency additions,
anything touching security, routing, the build, or the deploy. Run the pipeline in
[Workflow](#workflow).

### When you can't tell

Ask the human which path they want, in one line, and say which way you lean. Guessing up
costs a pipeline nobody needed; guessing down ships a structural change with no review.

---

## Stack and run configuration

| | |
|---|---|
| Generator | Astro 7, static output, one justified JS island (the header's mobile nav — see [`docs/infrastructure.md`](docs/infrastructure.md)) |
| Node | floor `>=22.12.0` in `engines`; `.nvmrc` names the major line (`24`) both workflows build on, pinned by `tests/ci-workflow.test.ts` |
| Package manager | npm, lockfile committed |
| Host | GitHub Pages via `.github/workflows/deploy.yml` on push to `master` |
| CI | `.github/workflows/ci.yml` — `npm ci`, `npx astro check`, `npm test` on every PR and push to `master` |
| Content | Markdown in `src/content/`, typed frontmatter schemas |

```sh
npm install          # install dependencies
npm run dev          # dev server on localhost:4321
npm run build        # production build to ./dist/
npm run preview      # serve the built output
npx astro check      # type and template diagnostics
npm test             # vitest run — 16 files, 352 tests; see docs/testing.md
```

Three run rules, each binding:

- **A test file must never run `astro build` itself.** `tests/global-setup.ts` builds once
  per vitest invocation; every HTML-reading suite reads that `dist/`.
  `tests/test-harness-contract.test.ts` enforces it.
- **Use `npm test` (run mode) when freshness matters.** `vitest --watch` does not rebuild on
  a `.astro` change.
- **Start a dev server in background mode** as an agent: `astro dev --background`, managed
  with `astro dev stop | status | logs`. Never leave a foreground server blocking a turn.
  Reuse one running server across a session rather than starting and stopping per task.

If a deleted `src/content/` file still emits a page, clear the loader cache with
`rm -rf node_modules/.astro` — `rm -rf .astro dist` is not enough.

---

## Repo layout

```
technoise/
├─ .claude/agents/      designer, developer, qa, documenter, gatekeeper
├─ .claude/skills/      a11y-verify, pr-creation, safe-install
├─ docs/                setup-guide, testing, brand-assets, infrastructure
├─ reports/             agent handoff reports (git-ignored)
├─ src/
│  ├─ assets/           astro:assets input — processed and hashed at build, unlike public/
│  ├─ content.config.ts schema for the collections below (Astro 7 path, not src/content/config.ts)
│  ├─ content/          blog/ and projects/ — one Markdown file per entry
│  ├─ components/       reusable, from the component inventory below
│  ├─ layouts/          page shells
│  ├─ lib/              shared TypeScript helpers, plus resume.ts (content, not logic)
│  ├─ pages/            routes, plus sitemap.xml.ts, rss.xml.ts, robots.txt.ts
│  └─ styles/           tokens.css and global styles
├─ public/brand/        the three live logo SVGs — anything here is published
├─ public/fonts/        the self-hosted Inter woff2 that fonts.css loads
├─ public/og/           the one committed Open Graph card (OG_IMAGE in src/lib/seo.ts)
├─ public/favicon.*     .ico plus one scheme-invariant SVG — two files, two links
├─ archive/             versioned but never built or served
├─ tests/               vitest suites, plus global-setup.ts — the one build they all read
└─ .github/workflows/   ci.yml (checks on PRs), deploy.yml (Pages)
```

Binding rules for this layout — rationale in [`docs/infrastructure.md`](docs/infrastructure.md)
and [`docs/brand-assets.md`](docs/brand-assets.md):

- **`public/` means deployed, not kept.** A file that must stay in the repo but must never be
  served goes in `archive/`. `public/` may hold no file `src/` references nowhere;
  `technoise-icon.svg` is the one documented exception.
- **Permission grants live on jobs, not on workflows.** Workflow level is `permissions: {}`.
  A third-party action is pinned to a full commit SHA with its version in a trailing comment.
  `tests/workflow-permissions.test.ts` enforces both on every file in `.github/workflows/`.
- **Re-exporting or re-cropping a brand SVG means revisiting `Footer.astro`'s hand-copied
  `918`/`835` extents.** The header reads its own `viewBox` at import time; the footer does
  not.
- **`sharp` is a declared `devDependency` and stays one.** Its range tracks astro's own
  `optionalDependencies.sharp`; bump them together.
- **CI reports, it does not yet gate.** Marking `verify` a required status check on `master`
  is a GitHub repo setting no agent can make.

### The resume privacy rule

`src/lib/resume.ts` holds content rather than logic, and its types are load-bearing for a
standing rule:

> **`/resume/` may never publish a phone number or a city/state/other location — not in its
> visible text, its JSON-LD, or its metadata.**

The module's types carry no field either could occupy, and `tests/nav-contract.test.ts`
asserts this at three layers: the built HTML, the parsed JSON-LD, and the exported `RESUME`
object's own keys — so a location field added before anything renders it still fails the
suite. This rule outlives the cycle that added it. Treat any future edit to `resume.ts` or
`resume.astro` as bound by it.

---

## Design standards

These are binding. A change that violates them is a defect, not a preference.

### Color tokens

Defined once as CSS custom properties in `src/styles/tokens.css`. Never hardcode a hex value
anywhere else.

| Role | Token | Value | Contrast on cream | Rule |
|---|---|---|---|---|
| Page background | `--cream` | `#FDF9F3` | — | The page is cream, never pure white |
| Body text | `--ink` | `#0C3242` | 12.9:1 | Passes AAA |
| Link text | `--signal-700` | `#0A6F94` | 5.4:1 | Use for all body links |
| Raw signal | `--signal` | `#0C83AE` | 4.1:1 | **Fails AA** — large text, icons, borders only |
| Orange text | `--pulse-700` | `#B94614` | 5.1:1 | Orange text on cream |
| Raw pulse | `--pulse` | `#F75E1A` | 3.0:1 | Button *fills* and rules only, never text on cream |
| Borders / muted UI | `--slate` | `#C2D1D8` | 1.5:1 | Decorative only |

Dark mode (ink becomes the page, via `prefers-color-scheme`): links lighten to `#6EC9E8`
(7.2:1 on ink), accents to `#FF9F6B` (6.7:1 on ink). Body text uses `--cream-dim` (`#E5E5E1`,
10.72:1) and muted text `--cream-muted` (`#B5BDBE`, 7.09:1) — both dimmed below light mode's
12.9:1 on purpose: the same ratio emitted from a dark screen reads as glare. The home hero's
scrim opacity rises to 0.86 in dark mode (from 0.72) for the same reason. All dark-mode tints
derive from the brand bases — do not introduce new hues.

Keep every dark-scheme rule scoped to `@media screen`, so `@media print` gets the light
tokens without asking. `tests/build-output.test.ts` scans the shipped CSS for this.

**The hex exception.** A hex literal is tolerated outside `tokens.css` only where a `var()`
genuinely cannot reach — a `<img src>`/`<link>`-referenced file, or a caption printing a
value rather than styling with it — and only where a test reads `tokens.css` at test time and
fails on drift. Exactly two instances exist: the four brand SVGs
(`public/brand/*.svg` plus `public/favicon.svg`) and `src/lib/palette.ts`. Before editing
either, read [`docs/brand-assets.md`](docs/brand-assets.md) — it covers the two file roles,
why the mascot renders at 1.000:1 in dark mode **on purpose**, and what the tint tests guard.
Don't "fix" the hardcoded hex in those files without re-running `tests/brand-assets.test.ts`.

### The three posture rules

1. **Orange appears once per screen.** It is the "do this" color. Three orange things on a
   page means the page has no call to action. *Carve-out:* the `.tn-pulse` headphones baked
   into the brand logo SVGs don't count — that is fixed brand chrome, not a page-content
   signal. Two logo instances plus one CTA is the correct count.
2. **Cream is the page, never white.** Pure white next to `#FDF9F3` reads as a rendering bug.
3. **The mascot is a guest, not wallpaper.** This applies to the mascot as *page content or
   illustration* — home hero, About, and 404 only. It does not apply to the mascot as part of
   the fixed brand lockup: header, footer, and favicon render on every page, as any site's
   signage would. Illustration-of-the-page vs. identity-of-the-site is the distinction.

Editorial layout, generous whitespace, one column of readable text. No cards-in-cards, no
gradients, no shadow deeper than a hairline.

### Type and rhythm

- **Two families maximum**: one humanist sans for everything, one mono for code.
- **Body**: 18px mobile, 19–20px desktop. Measure capped at 68–72 characters.
- **Line height**: 1.65 body, 1.2 headings.
- **Type scale (1.25)**: 14 / 16 / 18 / 20 / 25 / 31 / 39 / 49 px. Nothing outside it.
- **Spacing scale**: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px. Nothing outside it.
- **Grid**: single 720px content column, widening to 1100px only for project card grids and
  the footer. Gutters 24px mobile, 48px desktop.

`48em` is the site's one responsive hinge, reused deliberately rather than adding a second
breakpoint. Changing its value means editing three CSS sites plus one HTML attribute — see
[`docs/infrastructure.md`](docs/infrastructure.md) before you touch it.

### Component inventory

Build once, reuse everywhere:

Header · Footer · PostCard · ProjectCard · TagPill · Prose block · CodeBlock with copy
button · Callout · Pagination · Breadcrumb · ThemeToggle · SEO head block · OG image template

If a page needs a thirteenth component, question the page before adding it.

**ThemeToggle has a half-satisfied prerequisite.** The header no longer depends on scheme
propagation into a referenced image; the footer still does, and that mechanism is verified in
Chromium 141 only. Read [`docs/brand-assets.md`](docs/brand-assets.md) before building it.

**`Prose` forwards unrecognized props (`...rest`) onto its root `<div>`**, not just `class`.
Astro hands a child its parent's scoped-style attribute as a prop, and the child must place
it on its own root or the parent's scoped rules never match. Every call site today passes
only `class`; keep it that way, since the spread also means a typo'd prop name type-checks
and lands silently in the DOM.

### Accessibility and performance floors

Non-negotiable on every change:

- Keyboard-only navigation works; focus states are visible.
- Layout holds at 320px and in dark mode.
- Body text meets 4.5:1 contrast; large text 3:1.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO = 100 — for indexable pages.
  `/404.html` scores SEO 69 by design (`is-crawlable` fails on its deliberate `noindex`);
  that is correct, not a defect.
- Zero client JS unless a feature genuinely requires an island.

---

## Code conventions

- TypeScript for anything with logic; typed frontmatter schemas for all content collections,
  defined in `src/content.config.ts` using the `glob()` loader from `astro/loaders`. Astro 7
  throws `LegacyContentConfigError` on the pre-7 `src/content/config.ts` path.
- Components are `.astro` by default. Reach for a framework island only when interactivity
  cannot be done with HTML and CSS, and say why.
- Styles go in `src/styles/` or a component's own `<style>` block. Tokens only — no raw hex,
  no off-scale sizes or spacing.
- **Route-scoped stylesheets are imported by the page that needs them**, not by `BaseLayout`
  or a shared component. `src/styles/print.css` is the first, imported only by
  `resume.astro`.
- Semantic HTML first: a `<button>` is a button, a `<nav>` is a nav.
- Absolute canonical URLs; unique title (≤60 chars) and description (≤155 chars) per page.
- Comments explain *why*, never *what*. Default to none.
- Do not add dependencies without flagging it — every dependency is a future upgrade and a
  supply-chain surface.
- Don't reintroduce a Shiki theme or `markdown.syntaxHighlight: false` without accounting for
  the transformer in `astro.config.mjs` (see [`docs/infrastructure.md`](docs/infrastructure.md)).

### Page SEO

Every page renders through `BaseLayout`, which feeds `<SeoHead>` and owns nothing else a
crawler or social client reads. A page passes:

- `title`, `description` — required. `title` is the full `<title>` text (callers append
  `SITE.titleSuffix` via `pageTitle()`; the home page alone stays bare). `description`
  doubles as the card summary and the meta description.
- `canonicalPath?` — omit it and the layout derives one from the page's own URL, so a new
  route is canonical by default, not by remembering.
- `noindex?` — emits `noindex, nofollow` instead of the default
  `index, follow, max-image-preview:large`. Two pages use it, and both are the only routes
  absent from `STATIC_SITEMAP_ROUTES`: `/styleguide/` is real content nobody searched for;
  `/404.html` is not content at all, and a static host cannot pair it with a real 404 status,
  so an indexed one would be a soft 404. Lifting `noindex` and adding the route is the
  one-line change when a stub gains real content — as `/resume/` did.
- `ogType?`, `article?` — Open Graph/Twitter overrides. The card image is not a prop: every
  page shares the committed OG card (`OG_IMAGE` in `src/lib/seo.ts`).
- `prevPath?` / `nextPath?` — paginated listings only; emits `rel="prev"` / `rel="next"`.
- `schema?` — an array of JSON-LD `@graph` nodes; omitted or empty emits no `<script>` tag.

**No absolute URL is ever written as a literal hostname** — canonical, `og:url`, `og:image`,
JSON-LD `@id`, sitemap `<loc>`, RSS `link`/`guid`. Every one derives from `site` in
`astro.config.mjs` through the helpers in `src/lib/seo.ts`. A test walks `src/` and fails the
suite if a `technoise.dev` or `github.io` literal appears, so changing the domain stays a
one-line edit.

**This site supports a root deploy only.** `site` must be an origin whose pathname is `/`,
and `base` must stay unset or `/`. `assertRootDeploy()` enforces this at build time.

### Content authoring rules

Binding for every entry in `src/content/blog/` and `src/content/projects/`, enforced by the
schema in `src/content.config.ts`:

- `title` ≤48 characters. Every page renders `` `${title} — TechNoise` ``; the suffix costs 12
  of the 60-character `<title>` budget, so 48 is the full remaining allowance.
- `description` ≤155 characters. It is the card summary, the detail-page lede, and the meta
  description — one field, not three.
- `tags`: lowercase, hyphenated (`^[a-z0-9]+(-[a-z0-9]+)*$`), ≤24 characters each, 1–4 per
  entry. Stored and displayed in slug form so `"Astro"` and `"astro"` can't open two archives
  for one idea.
- Entries sit **directly** in the collection directory — `src/content/blog/<slug>.md`, never
  `<dir>/<slug>.md`. A nested id keeps its directory prefix and cannot become a single URL
  segment, so the build fails with `TypeError: Missing parameter: slug` and no filename.
- A post's filename may not be a bare number — it collides with the `/blog/<n>/` pagination
  routes.
- Both slug rules are enforced in `assertRoutableId()` in `src/lib/content.ts`, called from
  `getPublishedPosts()` and `getPublishedProjects()` — the one path every route already takes.
  Keep future slug rules there rather than adding a route-local guard.
- `draft: true` hides an entry from production builds only; `astro dev` still shows it.
- Astro renders raw HTML inside Markdown by default, so a `.md` file is as privileged as a
  component. Every file in `src/content/` today is repo-authored and reviewed; if content is
  ever accepted from outside the repo, add a rehype sanitizer at that point.

---

## Workflow

Read [Pick the path first](#pick-the-path-first) before starting. If the change is a quick
tweak, you are already done — there is no pipeline and no report.

For a structural change, the production cycle is a one-way pipeline. Each stage reads the
report from the stage before it and writes exactly one report for the stage after it.

```
designer ──design-report──▶ developer ──dev-report──▶ qa ──qa-report──▶ documenter ──▶ PR
                                 ▲                      │
                                 └──── blocking ────────┘
                                       findings

PR ──▶ human merges (or doesn't)
  └──▶ gatekeeper, ONLY when the human asks ──▶ review comments
                                                   │
                                                   └── MAJOR ──▶ Issue ──▶ developer on
                                                                bugfix/<slug> ──▶ qa ──▶ PR
```

- **designer** — produces a numbered checklist of changes, plus whatever prose, measurements
  and markup *excerpts* the report needs to be unambiguous. The report is the whole
  deliverable: the designer never commits `.astro` or `.css` files. A committed template
  reads as source and drifts from `src/` the moment the developer implements it.
- **developer** — implements every checklist item, one commit per coherent unit.
- **qa** — reviews for vulnerabilities, writes tests where there is real logic, judges
  production readiness. A blocking verdict sends the work back to developer with the same
  report as input.
- **documenter** — updates README, AGENTS.md, and `docs/` when architecture, design standards,
  or run configuration changed. Runs last, and only when something durable changed. Opens the
  PR, then stops. It does **not** hand off to gatekeeper.

`qa` runs before the PR exists and gates the handoff. A human decides what merges: no agent
approves, and no agent merges.

### Verification depth

Re-derive a claim independently when it is **new or risky** — a first-time contrast figure, a
structural change to how something is computed, a security-relevant path, anything no test
covers yet. Do not re-derive a number an upstream stage already computed and a test already
pins; cite the stage and the test instead. Re-tabulating verified figures is the single
largest source of report bloat in this repo.

### Gatekeeper — by human request only

The gatekeeper does **not** run automatically. It runs when the human explicitly asks for a PR
review, by PR number or by name. Nothing in the pipeline triggers it, and no other agent hands
off to it.

This is deliberate. Its question — *if this merges and deploys, what goes wrong?* — is worth
asking once over a PR that has accumulated real change, not once per increment. Let a PR
collect its increments, then ask for one gatekeeper pass.

When it runs: it reviews the PR on GitHub, comments on every finding, files a GitHub Issue for
each MAJOR one, and always submits as `COMMENT` — never `REQUEST_CHANGES`, never `APPROVE`.
Its review is advisory. If the human merges over it, that is final, and the Issue already
filed carries any real finding forward.

### Bugfix loop

A MAJOR gatekeeper finding becomes a GitHub Issue, not a blocked PR:

1. Branch `bugfix/<short-slug>` from an up-to-date `master`.
2. `developer` implements against the issue's acceptance criteria, referencing the issue
   number in the commit.
3. `qa` verifies as normal and writes `reports/qa-report.md`.
4. A new PR to `master`, merged by a human.

This keeps a follow-up fix from silently widening the PR that surfaced it.

---

## Handoff protocol

Reports are working state, not deliverables. `reports/` is git-ignored.

**Hard limits on every report:**

- **One file per stage**, at the fixed path below. Never a second file, an appendix, or a
  supplementary table in `reports/`.
- **250 lines maximum**, including the header block and any fenced excerpt. A report at the
  cap is not a target to fill — most should be well under it.
- **Under 300 words of prose** unless a blocking finding genuinely needs the detail. Tables
  and checklists don't count toward that; restating them in prose does.
- **No report at all on the quick-tweak path.** Summarize in chat instead.

If a report would exceed the cap, the fix is to cut, not to split: drop re-derived numbers an
upstream stage already verified, drop findings you decided not to raise, and cite files and
test names instead of quoting them.

| Stage | Writes | Reads |
|---|---|---|
| designer | `reports/design-report.md` | — |
| developer | `reports/dev-report.md` | `reports/design-report.md` |
| qa | `reports/qa-report.md` | `reports/dev-report.md` (+ design report for intent) |
| documenter | `reports/doc-report.md` | `reports/qa-report.md` |
| gatekeeper | `reports/gatekeeper-report.md` | the PR diff (+ qa report as a claim to test) |

**Only the latest report counts.** Before overwriting, move the existing file to
`reports/archive/<name>-<YYYYMMDD-HHMMSS>.md`. Archives are for humans debugging a cycle;
agents never read them.

Every report starts with the same header block so the next stage can validate its input:

```markdown
---
stage: designer | developer | qa | documenter | gatekeeper
feature: short-slug
branch: feature/short-slug
date: YYYY-MM-DD HH:MM
upstream: reports/<file>.md | none
status: ready | blocked
---
```

If the upstream report is missing, stale (points at a different feature or branch), or
`status: blocked`, stop and report that to the human. Do not improvise the missing stage.

Checklist items carry stable IDs (`D1`, `D2`, …) assigned by the designer. Every later stage
refers to work by that ID so a human can trace one line from design to test. Gatekeeper
findings use `G1`, `G2`, … the same way.

The gatekeeper is the one stage whose real output lives on GitHub — review comments and
Issues, where reviewers actually look. Its report is a local record, not the deliverable. A
reviewer must never have to open a git-ignored file to learn what was flagged.

---

## Git rules

Hard limits on every agent.

- **Work happens on a feature branch.** `feature/<short-slug>` for new work,
  `bugfix/<short-slug>` when resolving a gatekeeper Issue. Both branch from an up-to-date
  `master`. Never commit directly to `master`. This holds on the quick-tweak path too.
- **Agents push to feature and bugfix branches only.** Never push to `master`, never
  force-push a branch an agent did not create, never rewrite published history.
- **Raise a PR to `master` for human review.** No agent approves or merges its own work — or
  anyone else's. That includes the gatekeeper, whose review is a signal, not a veto.
- **Every GitHub comment, review, and issue ends with the attribution footer**, so reviewers
  know it was agent-authored:

  ```

  ---
  _Generated by [Claude Code](https://claude.ai/code)_
  ```
- Commit messages: imperative subject under 72 chars, body explaining *why*. Reference
  checklist IDs where they apply.
- Never commit `reports/`, `dist/`, `node_modules/`, or anything matching `.gitignore`.
- Run `git status` before any command that could discard uncommitted work.
