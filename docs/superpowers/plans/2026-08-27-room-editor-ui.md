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

## Follow-ups (not started)

1. **Cell-by-cell layout editor** — toggle grid squares to reshape a room, still against the current rect-only core model until shape generalization lands (see below); needs its own design pass for how a non-rect selection degrades gracefully against a core that only understands rectangles today.
2. **Room shape generalization** (`packages/core`) — L/cross/circle/triangle/polygon rooms, randomized via a weighted, config-editable table, rooms as a union of sub-shapes. Touches `placeRooms`, `carve`, `extractWalls`, `verticalLinks` — all currently rect-assuming. Explicitly sequenced after both increments above.
3. **Persistence** — annotations and edits currently reset on reload by design (prototype scope); revisit once the interaction design is validated.
