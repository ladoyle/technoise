# TechNoise — Agent Contract

Every agent reads this file before doing anything else. It is the single source of
truth for development style, workflow, and handoffs. Where this file and a prompt
disagree, ask rather than guess.

The full design plan and phase roadmap lives in [`docs/setup-guide.md`](docs/setup-guide.md).

---

## Stack and run configuration

| | |
|---|---|
| Generator | Astro 7 (static output, zero JS by default) |
| Node | `>=22.12.0`, pinned in `.nvmrc` |
| Package manager | npm, lockfile committed |
| Host | GitHub Pages via `.github/workflows/deploy.yml` on push to `master` |
| Content | Markdown in `src/content/`, typed frontmatter schemas |

```sh
npm install          # install dependencies
npm run dev          # dev server on localhost:4321
npm run build        # production build to ./dist/
npm run preview      # serve the built output
npx astro check      # type and template diagnostics
```

When starting the dev server as an agent, use background mode: `astro dev --background`.
Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`. Never leave a
foreground dev server blocking a turn.

---

## Repo layout

```
technoise/
├─ .claude/agents/      designer, developer, qa, documenter
├─ docs/                setup-guide.md — design plan and phase roadmap
├─ reports/             agent handoff reports (git-ignored)
├─ src/
│  ├─ content/          blog/ and projects/ — one Markdown file per entry
│  ├─ components/       reusable, from the component inventory below
│  ├─ layouts/          page shells
│  ├─ pages/            routes
│  └─ styles/           tokens.css and global styles
├─ public/brand/        committed logo sources
└─ .github/workflows/   deploy.yml
```

---

## Design standards

These are binding. A change that violates them is a defect, not a preference.

### Color tokens

Defined once as CSS custom properties in `src/styles/tokens.css`. Never hardcode a hex
value anywhere else.

| Role | Token | Value | Contrast on cream | Rule |
|---|---|---|---|---|
| Page background | `--cream` | `#FDF9F3` | — | The page is cream, never pure white |
| Body text | `--ink` | `#0C3242` | 12.9:1 | Passes AAA |
| Link text | `--signal-700` | `#0A6F94` | 5.4:1 | Use for all body links |
| Raw signal | `--signal` | `#0C83AE` | 4.1:1 | **Fails AA** — large text, icons, borders only |
| Orange text | `--pulse-700` | `#B94614` | 5.1:1 | Orange text on cream |
| Raw pulse | `--pulse` | `#F75E1A` | 3.1:1 | Button *fills* and rules only, never text on cream |
| Borders / muted UI | `--slate` | `#C2D1D8` | 1.5:1 | Decorative only |

Dark mode (ink becomes the page, via `prefers-color-scheme`): links lighten to `#6EC9E8`
(7.2:1 on ink), accents to `#FF9F6B` (6.7:1 on ink). Both are tints of the brand bases —
do not introduce new hues.

### The three posture rules

1. **Orange appears once per screen.** It is the "do this" color. Three orange things on a
   page means the page has no call to action.
2. **Cream is the page, never white.** Pure white next to `#FDF9F3` reads as a rendering bug.
3. **The mascot is a guest, not wallpaper.** Home hero, About, and 404 only.

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

### Component inventory

Build once, reuse everywhere:

Header · Footer · PostCard · ProjectCard · TagPill · Prose block · CodeBlock with copy
button · Callout · Pagination · Breadcrumb · ThemeToggle · SEO head block · OG image template

If a page needs a thirteenth component, question the page before adding it.

### Accessibility and performance floors

Non-negotiable on every change:

- Keyboard-only navigation works; focus states are visible.
- Layout holds at 320px and in dark mode.
- Body text meets 4.5:1 contrast; large text 3:1.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO = 100.
- Zero client JS unless a feature genuinely requires an island.

---

## Code conventions

- TypeScript for anything with logic; typed frontmatter schemas for all content collections.
- Components are `.astro` by default. Reach for a framework island only when interactivity
  cannot be done with HTML and CSS, and say why in the handoff report.
- Styles go in `src/styles/` or a component's own `<style>` block. Tokens only — no raw hex,
  no off-scale sizes or spacing.
- Semantic HTML first: a `<button>` is a button, a `<nav>` is a nav.
- Absolute canonical URLs; unique title (≤60 chars) and description (≤155 chars) per page.
- Comments explain *why*, never *what*. Default to none.
- Do not add dependencies without flagging it in the handoff report — every dependency is a
  future upgrade and a supply-chain surface.

---

## Workflow

The production cycle is a one-way pipeline. Each stage reads the report from the stage
before it and writes exactly one report for the stage after it.

```
designer ──design-report──▶ developer ──dev-report──▶ qa ──qa-report──▶ documenter ──doc-report──▶ human review
                                 ▲                      │
                                 └──── blocking ────────┘
                                       findings
```

- **designer** — produces design templates and a numbered checklist of changes to make.
- **developer** — implements every checklist item, one commit per coherent unit.
- **qa** — reviews for vulnerabilities, writes unit tests, judges production readiness.
  A blocking verdict sends the work back to developer with the same report as input.
- **documenter** — updates README, AGENTS.md, and docs when architecture, design standards,
  or run configuration changed. Runs last, and only when something durable changed.

A human reviews the PR. No agent merges.

---

## Handoff protocol

- All reports live in `reports/`. The directory is git-ignored — reports are working state,
  not deliverables.
- Each stage writes **one** report at a fixed path, overwriting the previous one:

  | Stage | Writes | Reads |
  |---|---|---|
  | designer | `reports/design-report.md` | — |
  | developer | `reports/dev-report.md` | `reports/design-report.md` |
  | qa | `reports/qa-report.md` | `reports/dev-report.md` (+ design report for intent) |
  | documenter | `reports/doc-report.md` | `reports/qa-report.md` |

- **Only the latest report counts.** Before overwriting, move the existing file to
  `reports/archive/<name>-<YYYYMMDD-HHMMSS>.md`. Archives are for humans debugging a cycle;
  agents never read them.
- Every report starts with the same header block so the next stage can validate its input:

  ```markdown
  ---
  stage: designer | developer | qa | documenter
  feature: short-slug
  branch: feature/short-slug
  date: YYYY-MM-DD HH:MM
  upstream: reports/<file>.md | none
  status: ready | blocked
  ---
  ```

- If the upstream report is missing, stale (points at a different feature or branch), or
  `status: blocked`, stop and report that to the human. Do not improvise the missing stage.
- Checklist items carry stable IDs (`D1`, `D2`, …) assigned by the designer. Every later
  stage refers to work by that ID so a human can trace one line from design to test.

---

## Git rules

These are hard limits on every agent.

- **Work happens on a feature branch.** `feature/<short-slug>`, branched from an up-to-date
  `master`. Never commit directly to `master`.
- **Agents push to feature branches only.** Never push to `master`, never force-push a branch
  an agent did not create, never rewrite published history.
- **Raise a PR to `master` for human review.** The documenter (or whichever stage finishes the
  cycle) opens it. No agent approves or merges its own work — or anyone else's.
- Commit messages: imperative subject under 72 chars, body explaining *why*. Reference
  checklist IDs where they apply.
- Never commit `reports/`, `dist/`, `node_modules/`, or anything matching `.gitignore`.
- Run `git status` before any command that could discard uncommitted work.
