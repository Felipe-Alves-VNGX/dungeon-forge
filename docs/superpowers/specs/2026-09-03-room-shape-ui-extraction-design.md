# Design — Extract `packages/room-shape-ui` (Sub-project A)

## Context

`harness/src/shape-editor.js` implements the macro shape picker + interactive
custom-cell editor already used by the dev harness (`SHAPE_TYPES`,
`buildShapeEditorSVG`, `toggleCustomCell`, `isDisconnected`, etc.). The
upcoming Foundry-native room editor (Sub-project C, separate spec) needs the
exact same logic — it's already framework-agnostic (every export takes plain
data or a generic DOM container, none of it references `harness/index.html`'s
specific element ids). This spec covers extracting that file (and its tests)
into a new shared workspace package so both `harness` and
`packages/adapter-foundry` depend on one implementation instead of two
diverging copies.

## Goals

- One canonical implementation of the shape-editor pure functions, importable
  by both `harness` and `packages/adapter-foundry`.
- Zero behavior change to the harness — this is a pure move/rename, not a
  rewrite.

## Non-goals

- Any new functionality. This spec is scoped to extraction only; Sub-project
  C (the Foundry-native room editor UI) is a separate spec/plan that
  *consumes* this package once it exists.

## What moves

`harness/src/shape-editor.js` → `packages/room-shape-ui/src/shape-editor.js`,
verbatim (every export listed below is already DOM-container-agnostic or pure
data — confirmed by reading the current file in full):

- `SHAPE_TYPES`, `defaultParamsFor`, `smallRoomWarningApplies`
- `cellsFromRoom`, `toggleCustomCell`, `isDisconnected`
- `buildShapeEditorSVG` (depends only on `@dungeon-forge/core`'s
  `rasterizeRoom`, `room`, `dungeon.width/height`, `gridSize`)
- `wireShapeEditorToggle` (depends only on a generic `container` with a
  `.shape-editor-svg` child — never references a harness-specific id)

`harness/test/shape-editor.test.js` moves to
`packages/room-shape-ui/test/shape-editor.test.js` the same way, unchanged.

## New package

```
packages/room-shape-ui/
  package.json       # @dungeon-forge/room-shape-ui, depends on @dungeon-forge/core
  src/shape-editor.js
  test/shape-editor.test.js
```

`harness/src/shape-editor.js` is deleted; `harness/src/room-manager.js`'s
import changes from `./shape-editor.js` to `@dungeon-forge/room-shape-ui`.
`vitest.workspace.js` gains `'packages/room-shape-ui'`.

## Testing

- The moved test file is the only test coverage needed — it already covers
  every export. No new tests required for this extraction itself.
- After the move, run the full workspace suite and confirm the harness's
  existing shape-editor-integration behavior (already covered by
  `room-manager`'s own tests, if any — check before writing the plan) shows
  zero regression.
