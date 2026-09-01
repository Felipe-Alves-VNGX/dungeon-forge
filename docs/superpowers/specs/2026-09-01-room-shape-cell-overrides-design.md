# Design — Room shape cell overrides (harness fine-grained editing)

## Context

`docs/superpowers/specs/2026-09-01-harness-shape-visualization-design.md`
("Subsystem A") wires the harness to visualize and macro-edit real
`Room.shape` data (rect/l/cross/circle/triangle, picked from a dropdown +
type-specific parameter + w/h steppers). That covers "macro" shape creation.

This spec ("Subsystem B") adds a second, independent capability layered on
top: fine-grained, per-cell hand-editing of a room's shape, persisted for
real as part of the room (not a visual-only sketch). It reopens two pieces of
`packages/core` that the original 5-shape generalization (PR #4) deliberately
left untouched — `carve.js`'s centroid-cell dependency and the `Room.shape`
data model — because arbitrary per-cell edits can violate the invariant that
generalization was built around: every room's rounded-centroid cell
(`Math.round(room.cx)`, `Math.round(room.cy)`) is always a real cell of that
room, which `carve.js`'s `roomBoundaryCell` relies on without any other
check.

Scope is **harness-only, manual editing** — `placeRooms`/`sampleShapeParams`
never produce a `'custom'` shape on their own; a room only becomes `'custom'`
when a human edits it by hand in the harness. No new `Rng` usage, no change
to generation determinism.

## Goals

- A user can toggle individual cells of a room (add/remove) in the harness,
  with the result persisted as the room's real, final shape — not merely a
  bounding-box approximation of what was toggled.
- `carve.js` keeps connecting every room correctly even when the toggled cell
  set doesn't contain the room's geometric bounding-box centroid.
- No change to `packages/core` generation behavior, RNG usage, or existing
  shape types' rasterization.

## Non-goals

- Random/generated custom shapes (Subsystem B is authoring-only).
- Reconciling a `'custom'` cell list against a macro type's parameters after
  the fact (switching macro type after a custom edit simply resets — see
  below).
- Blocking disconnected cell sets — allowed, with a non-blocking warning.
- Re-carving corridors or re-extracting walls automatically when a shape is
  edited (same pre-existing limitation `floor-editor.js`'s drag already has —
  out of scope here too).

## Data model

`Room.shape` gains a 6th type:

```js
{ type: 'custom', params: { cells: [[dx, dy], ...] } }  // dx,dy relative to room.x/room.y
```

`packages/core/src/shapes.js`'s `rasterizeRoom` gets a `case 'custom'`:
returns `params.cells.map(([dx, dy]) => ({ x: room.x + dx, y: room.y + dy }))`
directly — no rasterization math, the stored list *is* the cell set. Unlike
the other 5 rasterizers, `'custom'` carries **no** centroid-inclusion
guarantee — that's the whole point of this feature, and is why `carve.js`
needs the fallback below instead.

**Relationship to the macro editor (Subsystem A):** picking a macro type
(rect/l/cross/circle/triangle) always computes `params` fresh for that type
via the existing rasterizers — it never merges with a prior `'custom'` cell
list. A 6th option, "Começar do zero (custom)", initializes `params.cells`
from the room's *current* rasterization (whatever it was a moment before),
making it immediately hand-editable. Switching *away* from `'custom'` back to
a macro type discards `params.cells` entirely (with an inline warning before
doing so) — there is no diff/merge logic between "macro" and "custom",
deliberately, to avoid reconciling an override against a macro shape that may
have changed underneath it.

## `carve.js`: dynamic anchor cell instead of a stored field

`roomBoundaryCell(room)` (currently `{x: Math.round(room.cx), y: Math.round(room.cy)}`,
no validation) changes to `roomBoundaryCell(room, roomIdAt, width, height, floor)`:

1. Try the rounded centroid first (unchanged fast path — covers all 5
   existing shape types and the overwhelming majority of `'custom'` rooms
   too, since most hand edits don't happen to exclude the centroid).
2. If `getRoomId(roomIdAt, cx, cy, floor, width, height) !== room.id` (only
   reachable for a `'custom'` room whose centroid cell was removed by hand),
   scan the room's bounding box in row-major order and return the first cell
   that actually belongs to the room (`getRoomId(...) === room.id`).

This is computed fresh every call — no new persisted field on `Room`, so
there's nothing to go stale after a further edit. `carve()`'s two call sites
that already call `roomBoundaryCell` (line ~117-118 and ~131) pass the same
`roomIdAt`/`width`/`height`/`floor` they already have available as
parameters or closure state; `carve()`'s own signature gains `roomIdAt` as a
new parameter, threaded from `pipeline.js`'s existing call site (which
already computes `roomIdAt` before calling `carve`, for the shapes work in
PR #4).

No other change to `carve.js` — the A* pathfinding itself is untouched.

## Harness: cell toggle editor

Within `shape-editor.js` (Subsystem A), when a room's `shape.type === 'custom'`,
the preview grid stops being read-only and accepts click-to-toggle — the same
interaction `cell-editor.js` had before Subsystem A removed it, except the
toggled set now **is** the applied data (`room.shape.params.cells`), not a
bounding-box approximation of it. Every toggle:

1. Mutates `room.shape.params.cells` directly (in place, same live-apply
   convention as the rest of the harness).
2. Recomputes `room.w/h/cx/cy` from the toggled set's bounding box (same
   arithmetic `cell-editor.js`'s `cellSetToBoundingRect` already had).
3. Re-renders the shape-editor preview, the thumbnail, and the floor editor.

The type dropdown from Subsystem A gains a 6th entry, "Começar do zero
(custom)", which seeds `cells` from `rasterizeRoom(room)`'s current output
(so switching into custom mode never starts from an empty room).

## Edge cases

- **Can't remove the last cell** — same guard `cell-editor.js` already has.
- **No other cell is protected**, including the geometric centroid — thanks
  to the `carve.js` fallback above, any non-empty cell set has a valid
  A*-reachable anchor, so there's no need to special-case the centroid cell
  in the editor's toggle guard.
- **Disconnected cell sets are allowed**, with a non-blocking inline warning
  ("células desconectadas — carve.js pode gerar um corredor estranho") —
  same freedom-first philosophy the original `cell-editor.js` had ("any cell
  can be turned on, including cells far outside the room's current
  rectangle").
- **`extract-walls.js` needs no change** — it already detects doors via real
  cell ownership (`roomIdAt`), proven in the prior generalization work
  (Task 10) to handle arbitrary — including disconnected or concave — cell
  sets correctly.
- **`05-vertical-links.js` needs no change** — its bbox-overlap guard (added
  in the prior generalization's final review) already rejects stair
  footprints anywhere inside a room's bounding box, regardless of which
  cells within that bbox are actually occupied.

## Testing

- `06-carve.test.js`: new regression test — a `'custom'` room whose stored
  `cells` list excludes the cell at `Math.round(cx, cy)` (removed on
  purpose), confirming `roomBoundaryCell`'s fallback finds a real member cell
  and `carve()` still connects the room.
- `shapes.test.js`: new tests for `rasterizeRoom`'s `'custom'` case — returns
  exactly the stored cell list translated by `room.x/y`, no centroid
  guarantee asserted (explicitly, to document that `'custom'` is the one
  shape type without it).
- `shape-editor.test.js` (Subsystem A's test file): toggle in custom mode
  mutates `cells` directly and recomputes the bounding box; disconnection
  warning triggers correctly; switching macro type after a custom edit resets
  `cells` and shows the discard warning.
- Manual Playwright verification: enter custom mode, remove the cell that was
  the old centroid, confirm the room stays reachable in the floor editor
  (corridor still connects to it).
