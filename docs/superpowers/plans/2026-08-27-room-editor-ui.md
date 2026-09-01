# Room Editor UI — Spec

## Context

This is a living spec, not a one-shot plan file — per the user's explicit instruction (2026-08-27), design docs for ongoing work should be committed here under `docs/superpowers/plans/`, not left in the ephemeral plan-mode file. Extend this document as the room-editor direction grows instead of re-deriving the design from scratch each session.

**Origin:** the user asked (2026-08-27) for a custom window to manage rooms/annotations/regions, with a rotatable room-layout thumbnail and a compass rose, evolving later into full room editing (layout, position). A separate, larger request — irregular/composite room shapes (L, cross, circle, triangle, polygon), randomized via a weighted, config-editable table — was explicitly sequenced by the user to come **after** this editor prototype, to avoid mixing two large architectural changes at once.

**Scope boundary, confirmed by the user:**
- "Regions" in this UI = the real Foundry Region concept (teleport-pair behavior). That only exists once `adapter-foundry` (M4a/M4b) is built, which is still blocked on golden samples (SPEC.md §2.4 — needs JSON exported from a real Foundry VTT instance, which the user hasn't provided). Until then, `VerticalLink` (`dungeon.links`) is the pre-adapter stand-in — it already carries the `roomIdFrom`/`roomIdTo`/`fromFloor`/`toFloor` pairing a Region will eventually encode. The UI must label this honestly as a preview, not as if Regions already exist.
- Prototype phase: **harness-only** (`harness/`, Vite dev tool). No `packages/core` or `packages/render` changes. No persistence — annotations and UI-only state live in page memory and reset on reload.
- Future editing phase (not yet built) should be a **cell-by-cell grid editor** (toggle grid squares), not rectangle-drag-resize — that's what lets it extend naturally to irregular shapes later without a second editor UI. See the room-shapes memory (`future_room_shapes` in the assistant's persistent memory) for the shape-generalization phase itself; that phase touches `packages/core` (`placeRooms`, `carve`, `extractWalls`, `verticalLinks` all currently assume a room is a simple `x,y,w,h` rect) and is deliberately sequenced after everything in this doc.

## Increment 1 — Room manager prototype (DONE, commit `3819bcc`)

Added to `harness/`, reading `generateDungeon()`'s existing output — no core/render changes:

- **`harness/src/room-thumbnail.js`** — pure function `buildRoomThumbnailSVG(room, doors, rotationDeg)`. Draws the room's rectangle (normalized into a fixed viewBox), a tick per door on the actual side it sits on (`door.dir`, from the M6-era door-tracing work in `extractWalls`), dashed for secret doors, and a compass rose — all inside one rotating `<g>` so the compass and room turn together (a rigid SVG transform never changes their relative position, so the compass stays correct at any rotation).
- **`harness/src/room-manager.js`** — DOM wiring: room list grouped by floor (click to select), a "Regions (prévia — escadas)" panel listing `dungeon.links`, and a detail pane (thumbnail + rotation slider + the room's real exits straight from `dungeon.areas[].exits` + an in-memory annotation textarea, `Map<roomId,string>`, no persistence).
- **`harness/index.html` / `harness/src/main.js`** — new `#room-manager` section below the existing floor-image/key output (kept, not replaced); default `floors` bumped 1→2 so the Regions panel isn't empty on first load.

Verified manually via Playwright (no automated tests — matches the harness's existing no-test convention, `vitest.workspace.js` only covers `packages/core`/`packages/render`): room list/regions populate, door ticks land on the geometrically correct side (spot-checked all 6 ticks on a dense junction room against its real exits, including visually-adjacent pairs), rotation slider turns the room shape and compass together, secret doors render dashed.

## Increment 2 — Position editing (DONE)

Goal: drag a room to a new position on its floor, within the harness, still rectangle-only (shape generalization is a later phase, see above).

**`harness/src/floor-editor.js`** (new):
- `buildFloorEditorSVG(dungeon, floor, gridSize)` — reuses `buildRenderPlan` from `@dungeon-forge/render` for wall geometry (so it can never drift from what `renderFloor()` actually draws), overlays one `<g class="editable-room" data-room-id="...">` per room on that floor (rect + label).
- `wireFloorEditorDrag(container, dungeon, gridSize, onMoved)` — pointer-event drag (pointerdown/move/up, `setPointerCapture`), converts client coordinates to SVG-space via `getScreenCTM().inverse()`, snaps to whole grid cells, clamps to grid bounds, mutates `room.x/y/cx/cy` in place, updates the dragged `<rect>`/`<text>` directly (no full re-render needed), and reports the move via `onMoved`.

**Explicit prototype limitation (must stay visible in the UI, not just this doc):** dragging only moves the room's own rectangle. It does **not** re-carve corridors, re-run `extractWalls`, or move that room's doors/walls/`dungeon.areas` anchor — those stay exactly as generated. A dragged room can end up visually detached from its corridors. Reflowing the dungeon around a manual edit is future work, not this increment — SPEC.md itself has no path for "regenerate part of a dungeon after a manual edit" yet, and inventing one is a bigger design question than this increment should absorb silently.

Wired into `room-manager.js` (`renderFloorEditor()`, called from `setDungeon`/`selectRoom`, targets the currently-selected room's floor) and `harness/index.html` (`#floor-editor-section`, the caveat text is in the UI itself, not just this doc).

Verified via Playwright (synthetic `PointerEvent`s, since real drag input isn't available in this tool): dragging a room by (+4, +2) grid cells moved its rect by exactly (+96, +48) SVG units at `gridSize=24`; dragging far past the grid edge clamped to `(0, 0)` correctly; a full-floor screenshot after wiring shows all rooms correctly positioned/labeled against the existing wall geometry. (The synthetic `PointerEvent`s threw non-fatal `setPointerCapture`/`releasePointerCapture` `NotFoundError`s in the console — expected, since there's no real active pointer to capture outside actual mouse/touch input; doesn't affect the drag math, which ran and clamped correctly regardless.)

## Increment 3 — Cell-by-cell layout editor (DONE)

Goal: let the user toggle individual grid squares to sketch a room shape, while the core model (`packages/core`) still only understands rectangles — the design question the follow-up list flagged ("needs its own design pass for how a non-rect selection degrades gracefully").

**Resolved design:** toggling is free-form — any cell can be turned on/off, including cells far outside the room's current rectangle, so the UI can be used to sketch shapes the core can't represent yet. But only the **bounding rectangle** of the toggled cell set is ever applied to `room.x/y/w/h/cx/cy` — applied live, on every toggle, the same way Increment 2's drag applies live. The grid visually separates the two: toggled cells are shaded, the applied bounding rectangle is a distinct dashed outline, so a shape wider than its rectangle is honestly shown as "not really applied," not silently clipped. A guard refuses to toggle off the last remaining cell (a room can't have zero area). A "Resetar seleção" button re-derives the toggled set from the room's current applied rectangle, discarding any cells that don't match — useful after exploring a shape that doesn't fit.

**`harness/src/cell-editor.js`** (new): `rectToCellSet(room)`, `cellSetToBoundingRect(cellSet)`, `buildCellGridSVG(room, cellSet, dungeon, gridSize)` (renders a local grid — room rect padded by 3 cells in each direction, clamped to floor bounds — plus the dashed applied-rect overlay), `wireCellGridToggle(container, cellSet, onToggle)` (click-to-toggle, in-place `Set` mutation).

Wired into `room-manager.js`: `cellSelections` (`Map<roomId, Set<"x,y">>`, in-memory only, same non-persistence convention as `annotations`) initialized from the room's rect on first selection; `applyCellSelection` mutates the room and re-renders the cell grid, detail thumbnail, and floor editor (position-editor SVG), since a shape edit changes `w`/`h`, unlike Increment 2's move-only drag.

Verified via Playwright against the running harness (`npm install` was needed first — no `node_modules` existed yet in this environment; used the workspace-linked `harness/../node_modules/.bin/vite`, not a bare `npx vite`, which fetches an unlinked global version that can't resolve the `@dungeon-forge/*` workspace packages): toggling an off-cell at the grid's padded corner grew the applied rect from 11×9 to 14×12 cells and the floor editor's rect picked up the same new size; toggling off a corner on-cell dropped the on-count by one without shrinking the bounding rect (correct — other on-cells still span that extent); repeatedly toggling off never went below 1 on-cell; reset re-filled the toggled set to match the room's current (already-resized) rectangle. Screenshot confirms the grid, shaded cells, and dashed applied-rect render as designed.

## Follow-up 1 — Room shape generalization (DONE, PR #4, merged `ed45a9c`)

`packages/core` now supports 5 room shapes (rect/L/cross/circle/triangle), chosen per room via a weighted, config-editable table (`RoomParams.shapes`). See `docs/superpowers/specs/2026-08-31-room-shape-generalization-design.md` and `docs/superpowers/plans/2026-08-31-room-shape-generalization.md` for the design/plan. `carve.js` and `05-vertical-links.js` were deliberately left unchanged (both rely on the rounded-centroid-cell invariant every rasterizer guarantees); `10-extract-walls.js` was rewritten to detect doors via real cell ownership (`roomIdAt`) instead of bounding-box geometry, so concave shapes get correct doors including on interior walls.

**Explicitly NOT done here:** wiring `harness/` (room-manager, cell-editor, floor-editor) to actually use non-rect shapes — the harness is still 100% bounding-box (`cell-editor.js`'s toggle-cells UI still only ever applies the bounding rect, per Increment 3 above). Increment 3's toggled-but-not-applied cells remain a preview of what this could become, but turning that into a real `packages/core` shapes.js` round-trip (harness reads/writes `room.shape`, cell-editor toggles actual rasterizer params instead of just growing/shrinking a rect) is unstarted follow-on work, not covered by this follow-up.

## Follow-ups (not started)

2. **Persistence** — annotations and edits currently reset on reload by design (prototype scope); revisit once the interaction design is validated.
3. **Wire harness cell-editor to real room shapes** (new, split out of Follow-up 1 above) — replace `cell-editor.js`'s bbox-only toggle model with one that reads/writes `room.shape` and calls `rasterizeRoom`/`sampleShapeParams` from `packages/core/src/shapes.js`, so the harness can actually preview and hand-edit L/cross/circle/triangle rooms instead of only their bounding rectangle.
