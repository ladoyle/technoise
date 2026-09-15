---
name: safe-install
description: Install or update npm dependencies in this repo without risking silent package-lock.json corruption from the container's ambient npm. Use instead of a bare `npm install` any time a dependency is added, removed, or updated, or `node_modules` needs a fresh install.
---

# The problem

This environment's ambient npm (10.x) has been observed to silently rewrite
`package-lock.json` on install: it strips `libc` platform metadata from optional
dependency entries and has blanked `package.json`'s `name` field — with no warning, no
error, and a clean exit code. A plain `npm install` can look completely successful while
quietly corrupting the lockfile.

# Procedure

1. Snapshot the committed lockfile and package name before touching anything:

   ```sh
   git show HEAD:package-lock.json | grep -c '"libc"'
   git show HEAD:package.json | grep '"name"'
   ```

2. Install using a pinned modern npm instead of the ambient one:

   ```sh
   npx npm@11 install               # or: npx npm@11 install <package>
   ```

3. Re-run the same two checks against the working tree:

   ```sh
   grep -c '"libc"' package-lock.json
   grep '"name"' package.json
   ```

   The `name` field must be unchanged. The `libc` count should match the baseline unless
   the dependency change you made specifically adds/removes packages that carry that
   metadata — if it drops for no reason you can explain, treat it as corruption.

4. Read the actual diff, not just exit codes:

   ```sh
   git diff --stat package-lock.json package.json
   ```

   A blanked `name` field, or a broad rewrite touching packages unrelated to what you
   installed, means the install corrupted the lockfile.

5. If corrupted, discard and redo with `npm@11`:

   ```sh
   git checkout -- package-lock.json package.json
   # remove node_modules if it was also touched, then repeat step 2
   ```

# Notes

- This does not change the project's own npm/Node requirements (`.nvmrc`, `engines`) —
  `npx npm@11` is only how the install command runs, not what ships.
- Per the root CLAUDE.md dependency policy, flag any new dependency in the handoff
  report regardless of which npm ran the install.
