# room-shape-ui Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `harness/src/shape-editor.js` (and its test) into a new workspace package `packages/room-shape-ui`, so both `harness` and the upcoming `packages/adapter-foundry` UI can import the same shape-editing logic instead of diverging copies.

**Architecture:** Pure file move, zero logic change — every export in `shape-editor.js` is already DOM-container-agnostic (confirmed by reading the file in full during design). Task 1 creates the new package with the moved file+test and confirms it passes standalone. Task 2 rewires `harness` to import from the new package and deletes the old copy, confirming zero regression in the full workspace.

**Tech Stack:** Same as the rest of the monorepo — vanilla JS ES modules, Vitest, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-03-room-shape-ui-extraction-design.md`

## Global Constraints

- `Math.random` is banned repo-wide — not applicable (no randomness in this plan; it's a pure move).
- Zero behavior change — this plan must not alter any function's logic, only its file location and import path. Every existing test in the moved file must pass completely unmodified (only its `import` line changes, from a relative path to the new package name).

---

### Task 1: Create `packages/room-shape-ui`

**Files:**
- Create: `packages/room-shape-ui/package.json`
- Create: `packages/room-shape-ui/src/shape-editor.js` (moved from `harness/src/shape-editor.js`, byte-identical content)
- Create: `packages/room-shape-ui/test/shape-editor.test.js` (moved from `harness/test/shape-editor.test.js`, byte-identical content)
- Modify: `vitest.workspace.js`

**Interfaces:**
- Produces: `@dungeon-forge/room-shape-ui`, exporting `SHAPE_TYPES`, `defaultParamsFor`, `smallRoomWarningApplies`, `cellsFromRoom`, `toggleCustomCell`, `isDisconnected`, `buildShapeEditorSVG`, `wireShapeEditorToggle` — identical names/signatures to what `harness/src/shape-editor.js` already exports today.

- [ ] **Step 1: Confirm the workspace glob covers the new package**

Run: `cat package.json | grep -A3 workspaces`
Expected: includes `"packages/*"`, which already matches `packages/room-shape-ui` once it exists — no edit needed to the root `package.json`. If this glob is missing, stop and report BLOCKED (the repo's workspace config changed since this plan was written).

- [ ] **Step 2: Create `packages/room-shape-ui/package.json`**

```json
{
  "name": "@dungeon-forge/room-shape-ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/shape-editor.js",
  "dependencies": {
    "@dungeon-forge/core": "*"
  }
}
```

- [ ] **Step 3: Copy the source file verbatim**

Read `harness/src/shape-editor.js` in full, then create
`packages/room-shape-ui/src/shape-editor.js` with **exactly the same
content**, character for character — no edits, not even to comments. Do
not yet delete the original at `harness/src/shape-editor.js` (that happens
in Task 2, after `harness` has been rewired to the new import).

- [ ] **Step 4: Copy the test file, updating only its import path**

Read `harness/test/shape-editor.test.js` in full. Create
`packages/room-shape-ui/test/shape-editor.test.js` with identical content,
except the import line — change:
```js
import { ... } from '../src/shape-editor.js';
```
to (same relative pattern, now pointing within the new package):
```js
import { ... } from '../src/shape-editor.js';
```
(This line is unchanged in practice — both packages use the same
`../src/shape-editor.js` relative path convention from their own
`test/` directory. Do not change anything else in the file.)

- [ ] **Step 5: Add the new package to the vitest workspace**

In `vitest.workspace.js` (repo root), add the new project:

```js
export default [
  'packages/core',
  'packages/render',
  'packages/adapter-foundry',
  'harness',
  'packages/room-shape-ui',
];
```

(Match the exact existing array order/entries in the file — read it first;
this shows the expected final state assuming no other entries have
changed since this plan was written. If the file's current contents don't
match this list, preserve whatever is actually there and just add
`'packages/room-shape-ui'`.)

- [ ] **Step 6: Install to link the new workspace package**

Run: `npm install` (from the repo root) — creates the
`node_modules/@dungeon-forge/room-shape-ui` symlink needed for any later
consumer (Task 2) to resolve the package name.

- [ ] **Step 7: Run the new package's tests standalone**

Run: `npx vitest run packages/room-shape-ui`
Expected: all tests from the moved `shape-editor.test.js` pass, unchanged
in count and content from what they were in `harness/test/shape-editor.test.js`.

- [ ] **Step 8: Run the full workspace suite to confirm zero regression**

Run: `npx vitest run`
Expected: all tests pass — the harness's own (still-present, not yet
deleted) `shape-editor.test.js` and the new package's copy both pass, so
the total test count temporarily includes both (Task 2 removes the
duplication).

- [ ] **Step 9: Commit**

```bash
git add package-lock.json vitest.workspace.js packages/room-shape-ui/package.json packages/room-shape-ui/src/shape-editor.js packages/room-shape-ui/test/shape-editor.test.js
git commit -m "feat(room-shape-ui): extract shared shape-editor package from harness/src/shape-editor.js"
```

---

### Task 2: Rewire `harness` to the new package, delete the old copy

**Files:**
- Modify: `harness/package.json`
- Modify: `harness/src/room-manager.js`
- Delete: `harness/src/shape-editor.js`
- Delete: `harness/test/shape-editor.test.js`

**Interfaces:**
- Consumes: `@dungeon-forge/room-shape-ui` (Task 1) — same export names `room-manager.js` already imports today, just from a new package.

- [ ] **Step 1: Add the new dependency to `harness/package.json`**

Read the file first (its exact current `dependencies` block may have
evolved since this plan was written). Add
`"@dungeon-forge/room-shape-ui": "*"` alongside the existing
`"@dungeon-forge/core"` and `"@dungeon-forge/render"` entries.

- [ ] **Step 2: Update `room-manager.js`'s import**

Read `harness/src/room-manager.js` in full and find its import from
`./shape-editor.js` (currently importing `SHAPE_TYPES`, `defaultParamsFor`,
`smallRoomWarningApplies`, `buildShapeEditorSVG`, `cellsFromRoom`,
`toggleCustomCell`, `isDisconnected`, `wireShapeEditorToggle` — confirm the
exact current list by reading the file, since it may have grown). Change
only the module specifier, from:
```js
} from './shape-editor.js';
```
to:
```js
} from '@dungeon-forge/room-shape-ui';
```
Keep every imported name identical — this is a one-line specifier change,
not a rewrite of the import list.

- [ ] **Step 3: Run `npm install` to pick up the new dependency**

Run: `npm install` (from the repo root).

- [ ] **Step 4: Delete the old files**

```bash
git rm harness/src/shape-editor.js harness/test/shape-editor.test.js
```

- [ ] **Step 5: Run the full workspace suite**

Run: `npx vitest run`
Expected: all tests pass. The total test count should now be back to what
it was before Task 1 (the temporary duplication from Task 1 Step 8 is
gone — `packages/room-shape-ui`'s tests are the only copy now).

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: clean — confirms no dangling reference to the deleted
`harness/src/shape-editor.js` anywhere (an unresolved import would show up
as a real error, not just a lint warning, so this step is a secondary
confirmation alongside Step 5's test run).

- [ ] **Step 7: Manual smoke check — harness still works**

Run: `cd harness && npx vite` (or the repo's existing dev-server
convention) and confirm the harness dev server starts without console
errors about a missing `shape-editor.js` module. If a live browser isn't
available in this environment (it may not be, depending on the execution
context), at minimum confirm via `grep -rn "shape-editor" harness/` that
no file still references the deleted path — only `@dungeon-forge/room-shape-ui`
should appear.

- [ ] **Step 8: Commit**

```bash
git add harness/package.json harness/src/room-manager.js package-lock.json
git commit -m "refactor(harness): consume @dungeon-forge/room-shape-ui instead of a local copy"
```

---

## Final check

Run `npx vitest run` and `npm run lint` from the repo root once more after both tasks — both must be clean before moving to whole-branch review.
