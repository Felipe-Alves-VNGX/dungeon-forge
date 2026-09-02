# Design — Harness: real room-shape visualization + macro shape editor

## Context

`packages/core` (PR #4, merged `ed45a9c`) generalized `Room` from always-rectangular
to 5 possible shapes (`rect`/`l`/`cross`/`circle`/`triangle`), each rasterized to a
cell set by `packages/core/src/shapes.js`'s `rasterizeRoom(room)`. The `harness/`
dev tool was deliberately left untouched by that work and is still 100%
bounding-box: `room-thumbnail.js` and `floor-editor.js` draw one `<rect>` per room
using `room.x/y/w/h`, and `harness/src/cell-editor.js` lets a user toggle
individual grid cells but only ever *applies* the toggled set's bounding
rectangle — the shape a user sketches by hand is never the shape that gets
saved. This is `docs/superpowers/plans/2026-08-27-room-editor-ui.md`'s
Follow-up 3.

This spec covers **only** wiring the harness to visualize and macro-edit real
`Room.shape` data. A second, separate subsystem — persisting fine-grained,
per-cell edits on top of a macro shape — is out of scope here and gets its own
design doc (`2026-09-01-room-shape-cell-overrides-design.md`).

## Goals

- The room thumbnail and the floor editor draw a room's *actual* rasterized
  cells, not its bounding box.
- A user can pick one of the 5 shape types and its type-specific parameter
  (L's corner, triangle's orientation) for a room, and resize it (w/h), from
  the harness — applied live, same interaction convention as the existing
  drag-to-move and annotation editing (no separate "save" step).
- Zero change to `packages/core`'s generation behavior — this only touches
  how already-generated rooms are displayed and hand-edited in the harness.

## Non-goals

- Persisting arbitrary per-cell edits beyond the 5 typed shapes (Subsystem B,
  separate design).
- Any change to `packages/core/src/pipeline.js`'s generation logic, RNG usage,
  or the `Config`/`Dungeon` data model beyond one new public export.
- Re-carving corridors or re-extracting walls when a room's shape/size changes
  in the harness (same pre-existing limitation as drag-to-move in
  `floor-editor.js` — a hand-edited room can end up visually detached from its
  corridors; not addressed here).

## `packages/core` change

`rasterizeRoom` is exported today only from `packages/core/src/shapes.js`,
which isn't part of the package's public surface (`packages/core/package.json`'s
`main` is `src/pipeline.js`, which only re-exports `generateDungeon`,
`keyToMarkdown`, `validateDungeon`). Add one line to `pipeline.js`:

```js
export { rasterizeRoom } from './shapes.js';
```

No other core change. `rasterizeRoom` is a pure function of `room` — no `Rng`
needed, since the harness always supplies explicit shape params (never
`sampleShapeParams`'s random pick).

## Visualization: `room-thumbnail.js` + `floor-editor.js`

Both currently draw a single `<rect>` per room. Both switch to rendering one
small `<rect>` per cell in `rasterizeRoom(room)` — the same per-cell rendering
`cell-editor.js` already uses for its background grid today, just applied
without toggle interaction. For a `'rect'`-shaped room (the common case, and
the only case before this feature), this rasterizes as one contiguous block,
visually identical to today's single rect — no regression for existing
dungeons.

**`floor-editor.js`:** `roomRects` maps `rasterizeRoom(room)` instead of one
rect per room; the `<g class="editable-room">` wrapper (which the drag
interaction attaches to) wraps the full per-cell set for that room instead of
a single rect.

**`room-thumbnail.js`:** same substitution inside the rotating `<g>`. The door
tick placement logic (`doorTick`, lines 17-37) needs no change — it already
computes door position from absolute door coordinates and `room.x/y/w/h`
fractions, which stay correct regardless of shape (doors are generated
correctly for any shape by the already-generalized `extractWalls`).

## Macro shape editor: `cell-editor.js` → `shape-editor.js`

The file is renamed — the free-form cell-toggle interaction it implements
today goes away entirely (that interaction, if it returns, belongs to
Subsystem B as a distinct concern, not rebuilt here to be immediately
replaced). New responsibilities:

- **Type selector:** dropdown — rect / L / cross / circle / triangle.
- **Parameter selector**, shown conditionally: corner (nw/ne/sw/se) for `'l'`;
  orientation (up/down/left/right) for `'triangle'`; hidden entirely for
  `'rect'`/`'cross'`/`'circle'` (no extra params).
- **Size steppers:** two +/- controls for `w` and `h`, minimum 1 each.
- **Read-only preview grid:** renders `rasterizeRoom({...room, shape: {type, params}})`
  live as the user changes any control, using the same per-cell `<rect>`
  rendering as the visualization changes above — before the change is
  applied, so what's previewed always matches what gets drawn everywhere else
  once applied.
- Every control change applies immediately to `room.shape`/`room.w`/`room.h`/
  `room.cx`/`room.cy` (same live-apply convention as
  `room-manager.js`'s existing drag and annotation handling) — no separate
  apply/save action, and no more `cellSelections` in-memory Map (state lives
  on `room` directly, same as `room.x/y/w/h` already do).

### Small-room fallback warning

`packages/core/src/stages/01-place-rooms.js` silently falls back a
non-`'rect'` type to `'rect'` when `w<4 || h<4` (L/cross's notch formula
degenerates to zero below that). The harness editor mirrors that same
condition to show an inline warning *before* applying — "L/cross/circle/
triangle precisam de lado >= 4; esta sala vai virar retângulo" — so a user
picking `'l'` on a 3x3 room sees why they got a plain rectangle instead of
being silently surprised. The actual applied value still follows the core's
own fallback rule exactly (no divergent logic, just an earlier warning).

## Testing

- Unit tests for `shape-editor.js`'s pure SVG-building functions (successor to
  the existing `cell-editor.test.js`, adapted: no more toggle/bounding-rect
  tests, instead covering preview SVG output for each of the 5 types and the
  small-room-fallback warning condition).
- Manual Playwright verification against the running harness (same method as
  Increment 3): switch type to L, confirm preview changes; switch corner,
  confirm preview rotates; resize below 4 with a non-rect type, confirm the
  warning appears; confirm the thumbnail and floor editor reflect the same
  shape after applying.
- No new `packages/core` test beyond confirming the `rasterizeRoom` export
  exists (trivial, covered implicitly by anything in the harness importing
  it).
