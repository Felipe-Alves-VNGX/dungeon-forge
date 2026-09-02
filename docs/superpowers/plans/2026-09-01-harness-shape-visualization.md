# Harness Real Shape Visualization + Macro Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the harness draw a room's real rasterized shape (instead of its bounding box) in the thumbnail and floor editor, and replace the free-form cell-toggle prototype with a macro shape picker (type + parameter + size) that edits `Room.shape` for real.

**Architecture:** `packages/core` gains one new public export (`rasterizeRoom`, already implemented internally). Three harness modules switch from drawing/deriving a single bounding rectangle per room to drawing/deriving `rasterizeRoom(room)`'s per-cell output: `room-thumbnail.js`, `floor-editor.js` (visualization only, no interaction change), and `cell-editor.js` — renamed `shape-editor.js` — which drops its click-to-toggle interaction entirely in favor of a type/parameter dropdown and w/h steppers, all applying live to `room.shape`/`room.w`/`room.h` the same way existing drag/annotation edits already apply live.

**Tech Stack:** Vanilla JS + SVG string templates (no framework, matches existing harness code). Vitest for unit tests (already used in `packages/core`; this plan adds `harness` to the workspace's `vitest.workspace.js` for the first time).

**Spec:** `docs/superpowers/specs/2026-09-01-harness-shape-visualization-design.md`

## Global Constraints

- `Math.random` is banned repo-wide (ESLint `no-restricted-properties`) — not applicable to this plan's code (no randomness anywhere in these tasks; shape params are always explicitly chosen by the user, never sampled).
- Zero change to `packages/core` generation behavior — the only core change is adding one export line; no logic changes.
- Follow the harness's existing conventions: live-apply on every UI change (no separate "save" action), pure SVG-string-building functions kept separate from DOM-wiring functions (see `cell-editor.js`'s existing split between `buildCellGridSVG` and `wireCellGridToggle`), Portuguese for all user-facing copy.

---

### Task 1: Export `rasterizeRoom` from `packages/core`

**Files:**
- Modify: `packages/core/src/pipeline.js:182`
- Test: `packages/core/test/pipeline.test.js`

**Interfaces:**
- Produces: `rasterizeRoom(room)` importable as `import { rasterizeRoom } from '@dungeon-forge/core'` — same function already at `packages/core/src/shapes.js`'s `export function rasterizeRoom(room)`, just newly re-exported from the package's public entry point.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/pipeline.test.js` (alongside its existing imports/tests — read the file first to match its existing `import` style and `describe` structure):

```js
import { rasterizeRoom } from '../src/pipeline.js';

describe('rasterizeRoom re-export', () => {
  it('is importable from the package entry point and behaves like shapes.js\'s rasterizeRoom', () => {
    const room = { x: 2, y: 3, w: 4, h: 4, cx: 4, cy: 5 };
    const cells = rasterizeRoom(room);
    expect(cells).toHaveLength(16);
    expect(cells).toContainEqual({ x: 2, y: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/pipeline.test.js -t "rasterizeRoom re-export"`
Expected: FAIL — `rasterizeRoom` is not exported from `pipeline.js` yet (import resolves to `undefined`, `rasterizeRoom(room)` throws `TypeError: rasterizeRoom is not a function`).

- [ ] **Step 3: Add the export**

In `packages/core/src/pipeline.js`, find the existing re-export line (currently `export { keyToMarkdown, validateDungeon };` near the end of the file). Add `rasterizeRoom` to it and import it at the top of the file alongside the file's other stage imports:

```js
import { rasterizeRoom } from './shapes.js';
```

```js
export { keyToMarkdown, validateDungeon, rasterizeRoom };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/pipeline.test.js -t "rasterizeRoom re-export"`
Expected: PASS

- [ ] **Step 5: Run the full core suite to confirm zero regression**

Run: `cd packages/core && npx vitest run`
Expected: all tests pass (154 tests as of the prior branch, +1 for this new test = 155).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/pipeline.js packages/core/test/pipeline.test.js
git commit -m "feat(core): re-export rasterizeRoom from the package entry point"
```

---

### Task 2: `room-thumbnail.js` draws real shape cells

**Files:**
- Modify: `harness/src/room-thumbnail.js`
- Modify: `harness/index.html` (CSS: rename `.room-rect` → `.room-cell`)
- Create: `harness/test/room-thumbnail.test.js`
- Modify: `vitest.workspace.js` (add `'harness'`)

**Interfaces:**
- Consumes: `rasterizeRoom(room)` from `@dungeon-forge/core` (Task 1) — returns `Array<{x:number,y:number}>`, absolute grid coordinates.
- Produces: `buildRoomThumbnailSVG(room, doors, rotationDeg)` — same exported name and parameter list as before; only its internal rendering changes (no caller-visible interface change, `room-manager.js`'s existing call site at `renderDetail()` needs no edit).

This task is the first one to add a harness test, so it also wires up the workspace's test runner for `harness/` for the first time.

- [ ] **Step 1: Add `harness` to the vitest workspace**

In `vitest.workspace.js` (repo root), add the new project:

```js
export default [
  'packages/core',
  'packages/render',
  'harness',
];
```

- [ ] **Step 2: Write the failing test**

Create `harness/test/room-thumbnail.test.js`:

```js
// harness/test/room-thumbnail.test.js
import { describe, it, expect } from 'vitest';
import { buildRoomThumbnailSVG } from '../src/room-thumbnail.js';

function room(x, y, w, h, shape) {
  return { id: 0, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [], shape };
}

describe('buildRoomThumbnailSVG', () => {
  it('draws one cell rect per cell in a rect room (contiguous block)', () => {
    const r = room(0, 0, 3, 2);
    const svg = buildRoomThumbnailSVG(r, [], 0);
    const matches = svg.match(/class="room-cell"/g) ?? [];
    expect(matches).toHaveLength(6); // 3 * 2
  });

  it('draws fewer cells for an L-shaped room than its full bounding box', () => {
    const r = room(0, 0, 6, 6, { type: 'l', params: { corner: 'ne' } });
    const svg = buildRoomThumbnailSVG(r, [], 0);
    const matches = svg.match(/class="room-cell"/g) ?? [];
    expect(matches.length).toBeLessThan(36); // 6 * 6, notch removes cells
    expect(matches.length).toBeGreaterThan(0);
  });

  it('still renders the compass rose and door ticks', () => {
    const r = room(0, 0, 4, 4);
    const door = { id: 0, floor: 0, x1: 0, y1: 0, x2: 4, y2: 0, roomId: 0, secret: false, dir: 'n', toRoomId: null };
    r.doors = [0];
    const svg = buildRoomThumbnailSVG(r, [door], 0);
    expect(svg).toContain('compass-ring');
    expect(svg).toContain('door-tick');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run harness/test/room-thumbnail.test.js`
Expected: FAIL — current implementation renders `class="room-rect"` (singular, one rect), not `class="room-cell"` per cell; first two tests fail on the count assertion.

- [ ] **Step 4: Implement**

In `harness/src/room-thumbnail.js`, add the import and replace the single-rect rendering with per-cell rendering. Replace:

```js
import { rasterizeRoom } from '@dungeon-forge/core';
```

at the top (after the existing file comment), and replace the body of `buildRoomThumbnailSVG`:

```js
export function buildRoomThumbnailSVG(room, doors, rotationDeg = 0) {
  const scale = MAX_ROOM_SIZE / Math.max(room.w, room.h);
  const rectW = room.w * scale;
  const rectH = room.h * scale;
  const rect = { x: CENTER - rectW / 2, y: CENTER - rectH / 2, w: rectW, h: rectH };

  const cells = rasterizeRoom(room).map((cell) => {
    const dx = cell.x - room.x;
    const dy = cell.y - room.y;
    return `<rect class="room-cell" x="${(rect.x + dx * scale).toFixed(1)}" y="${(rect.y + dy * scale).toFixed(1)}" width="${scale.toFixed(1)}" height="${scale.toFixed(1)}" />`;
  }).join('');

  const roomDoors = doors.filter((d) => room.doors.includes(d.id));
  const ticks = roomDoors.map((d) => doorTick(d, room, rect)).join('');

  return `<svg class="room-thumb" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${rotationDeg}, ${CENTER}, ${CENTER})">
      ${cells}
      ${ticks}
      ${compassRose()}
    </g>
  </svg>`;
}
```

The `rect` local variable (the bounding rectangle) is still computed and still passed to `doorTick` — its geometry math is unchanged and still correct for positioning door ticks relative to the room's scaled bounding box, regardless of which cells are actually filled.

- [ ] **Step 5: Update CSS**

In `harness/index.html`, rename the `.room-rect` rule (do not add rounded corners back — `rx="2"` was on the single rect and doesn't apply per-cell; drop it):

```css
.room-cell { fill: #333; stroke: #999; stroke-width: 1; }
```
(replacing the existing `.room-rect { fill: #333; stroke: #999; stroke-width: 2; }` line)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run harness/test/room-thumbnail.test.js`
Expected: PASS (all 3 tests)

- [ ] **Step 7: Run the full workspace test suite to confirm zero regression**

Run: `npx vitest run`
Expected: all `packages/core`, `packages/render`, and `harness` tests pass.

- [ ] **Step 8: Commit**

```bash
git add vitest.workspace.js harness/src/room-thumbnail.js harness/test/room-thumbnail.test.js harness/index.html
git commit -m "feat(harness): room thumbnail draws real rasterized shape cells"
```

---

### Task 3: `floor-editor.js` draws real shape cells

**Files:**
- Modify: `harness/src/floor-editor.js`
- Modify: `harness/index.html` (CSS: rename `.edit-room-rect` → `.edit-room-cell`)
- Create: `harness/test/floor-editor.test.js`

**Interfaces:**
- Consumes: `rasterizeRoom(room)` from `@dungeon-forge/core` (Task 1).
- Produces: `buildFloorEditorSVG(dungeon, floor, gridSize)` — same exported name/signature; `wireFloorEditorDrag` (not shown here, read the file for its full contents before editing) attaches to `.editable-room` groups exactly as it does today — this task does not change drag behavior, only what's inside the `<g class="editable-room">`.

- [ ] **Step 1: Write the failing test**

Create `harness/test/floor-editor.test.js`. Read `harness/src/floor-editor.js` in full first — it calls `buildRenderPlan` from `@dungeon-forge/render`, so the test needs a real `dungeon` object shaped like what `generateDungeon` produces, not a hand-rolled stub. Use the workspace's core package directly:

```js
// harness/test/floor-editor.test.js
import { describe, it, expect } from 'vitest';
import { generateDungeon } from '@dungeon-forge/core';
import { buildFloorEditorSVG } from '../src/floor-editor.js';

const CONFIG = {
  seed: 'floor-editor-test',
  floors: 1, width: 40, height: 40,
  rooms: {
    count: 4, sizeMean: 6, sizeStdDev: 1, sizeMin: 4, sizeMax: 8, spawnRadius: 14, separationIters: 40,
    shapes: [{ type: 'l', weight: 1 }],
  },
  cycleRate: 0.15, verticalLinksPerGap: 2,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: { scheme: 'flat', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

describe('buildFloorEditorSVG', () => {
  it('draws one cell rect per room cell, not one rect per room', () => {
    const dungeon = generateDungeon(CONFIG);
    const svg = buildFloorEditorSVG(dungeon, 0, 20);
    const roomsOnFloor = dungeon.rooms.filter((r) => r.floor === 0);
    const matches = svg.match(/class="edit-room-cell"/g) ?? [];
    // Every room in this config is forced non-'rect' with a real notch (sizeMin 4+),
    // so the total cell count must be strictly less than the naive bbox sum.
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(roomsOnFloor.reduce((sum, r) => sum + r.w * r.h, 0));
  });

  it('still wraps each room\'s cells in one editable-room group per room', () => {
    const dungeon = generateDungeon(CONFIG);
    const svg = buildFloorEditorSVG(dungeon, 0, 20);
    const roomsOnFloor = dungeon.rooms.filter((r) => r.floor === 0);
    const groups = svg.match(/class="editable-room"/g) ?? [];
    expect(groups).toHaveLength(roomsOnFloor.length);
  });
});
```

(The `countNotch` helper is deliberately unused by the final assertions — it's left in only if a stricter per-room equality check is added later; the two tests above don't need it. Remove it if the linter flags it as unused.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run harness/test/floor-editor.test.js`
Expected: FAIL — current implementation renders `class="edit-room-rect"` (singular per room), not `class="edit-room-cell"`.

- [ ] **Step 3: Implement**

In `harness/src/floor-editor.js`, add the import:

```js
import { rasterizeRoom } from '@dungeon-forge/core';
```

Replace the `roomRects` construction:

```js
const roomRects = rooms.map((room) => {
  const label = areaByRoomId.get(room.id)?.label ?? room.id;
  const cells = rasterizeRoom(room).map((cell) => {
    const x = cell.x * gridSize;
    const y = cell.y * gridSize;
    return `<rect class="edit-room-cell role-${room.role}" x="${x}" y="${y}" width="${gridSize}" height="${gridSize}" />`;
  }).join('');
  const labelX = (room.x + room.w / 2) * gridSize;
  const labelY = (room.y + room.h / 2) * gridSize;
  return `<g class="editable-room" data-room-id="${room.id}" tabindex="0">
    ${cells}
    <text class="edit-room-label" x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="central">${label}</text>
  </g>`;
}).join('');
```

(The label stays centered on the bounding box, not shifted per-shape — same simple placement as before, still readable since it sits inside or very near the room's actual cells for all 5 shape types by the centroid-inclusion invariant.)

- [ ] **Step 4: Update CSS**

In `harness/index.html`, rename `.edit-room-rect` to `.edit-room-cell` (both the base rule and the `.dragging` variant):

```css
.edit-room-cell { fill: #2a3a2a; stroke: #6a8a6a; stroke-width: 1.5; }
.editable-room.dragging .edit-room-cell { fill: #3a4a3a; stroke: #9fd; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run harness/test/floor-editor.test.js`
Expected: PASS

- [ ] **Step 6: Run the full workspace test suite to confirm zero regression**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add harness/src/floor-editor.js harness/test/floor-editor.test.js harness/index.html
git commit -m "feat(harness): floor editor draws real rasterized shape cells per room"
```

---

### Task 4: `shape-editor.js` — macro type/parameter picker + size steppers

**Files:**
- Create: `harness/src/shape-editor.js` (replaces `harness/src/cell-editor.js`)
- Delete: `harness/src/cell-editor.js`
- Create: `harness/test/shape-editor.test.js` (replaces the never-created `cell-editor.test.js`)
- Modify: `harness/src/room-manager.js`
- Modify: `harness/index.html`

**Interfaces:**
- Consumes: `rasterizeRoom(room)` from `@dungeon-forge/core` (Task 1).
- Produces:
  - `SHAPE_TYPES` — exported array of `{ type: string, label: string, param: { key: string, label: string, options: {value:string,label:string}[] } | null }`, one entry per macro shape type (`rect`, `l`, `cross`, `circle`, `triangle`), in that order.
  - `defaultParamsFor(type)` — `(string) => Object`, e.g. `defaultParamsFor('l')` → `{ corner: 'nw' }`, `defaultParamsFor('rect')` → `{}`.
  - `smallRoomWarningApplies(type, w, h)` — `(string, number, number) => boolean`.
  - `buildShapeEditorSVG(room, dungeon, gridSize)` — `(Room, Dungeon, number) => string` (SVG markup), read-only preview.
  - Used by `room-manager.js` (this task also updates that file's wiring).

- [ ] **Step 1: Write the failing tests**

Create `harness/test/shape-editor.test.js`:

```js
// harness/test/shape-editor.test.js
import { describe, it, expect } from 'vitest';
import { SHAPE_TYPES, defaultParamsFor, smallRoomWarningApplies, buildShapeEditorSVG } from '../src/shape-editor.js';

function room(x, y, w, h, shape) {
  return { id: 0, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [], shape };
}

describe('SHAPE_TYPES', () => {
  it('lists exactly the 5 macro shape types in order, with param config only for l and triangle', () => {
    expect(SHAPE_TYPES.map((s) => s.type)).toEqual(['rect', 'l', 'cross', 'circle', 'triangle']);
    expect(SHAPE_TYPES.find((s) => s.type === 'rect').param).toBeNull();
    expect(SHAPE_TYPES.find((s) => s.type === 'cross').param).toBeNull();
    expect(SHAPE_TYPES.find((s) => s.type === 'circle').param).toBeNull();
    expect(SHAPE_TYPES.find((s) => s.type === 'l').param.key).toBe('corner');
    expect(SHAPE_TYPES.find((s) => s.type === 'triangle').param.key).toBe('orientation');
  });
});

describe('defaultParamsFor', () => {
  it('returns an empty object for param-less types', () => {
    expect(defaultParamsFor('rect')).toEqual({});
    expect(defaultParamsFor('cross')).toEqual({});
    expect(defaultParamsFor('circle')).toEqual({});
  });
  it('returns the first option for l (corner) and triangle (orientation)', () => {
    expect(defaultParamsFor('l')).toEqual({ corner: 'nw' });
    expect(defaultParamsFor('triangle')).toEqual({ orientation: 'up' });
  });
});

describe('smallRoomWarningApplies', () => {
  it('is false for rect regardless of size', () => {
    expect(smallRoomWarningApplies('rect', 2, 2)).toBe(false);
  });
  it('is true for a non-rect type below 4 on either side', () => {
    expect(smallRoomWarningApplies('l', 3, 5)).toBe(true);
    expect(smallRoomWarningApplies('cross', 5, 3)).toBe(true);
  });
  it('is false for a non-rect type at 4 or above on both sides', () => {
    expect(smallRoomWarningApplies('l', 4, 4)).toBe(false);
    expect(smallRoomWarningApplies('circle', 6, 5)).toBe(false);
  });
});

describe('buildShapeEditorSVG', () => {
  it('renders one shape-cell-on rect per cell in rasterizeRoom(room)', () => {
    const r = room(5, 5, 4, 4, { type: 'circle', params: {} });
    const dungeon = { width: 40, height: 40 };
    const svg = buildShapeEditorSVG(r, dungeon, 20);
    const matches = svg.match(/class="shape-cell-on"/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(16); // circle excludes corners of its 4x4 bbox
  });

  it('is read-only markup: no data-cx/data-cy toggle attributes', () => {
    const r = room(0, 0, 3, 3);
    const dungeon = { width: 40, height: 40 };
    const svg = buildShapeEditorSVG(r, dungeon, 20);
    expect(svg).not.toContain('data-cx');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run harness/test/shape-editor.test.js`
Expected: FAIL — `harness/src/shape-editor.js` doesn't exist yet.

- [ ] **Step 3: Implement `shape-editor.js`**

Create `harness/src/shape-editor.js`:

```js
// harness/src/shape-editor.js
//
// Macro shape editor: picks one of packages/core's 5 room shape types
// (rect/l/cross/circle/triangle) plus its type-specific parameter, and lets
// the user resize the room (w/h). Every control change applies directly to
// room.shape/room.w/room.h/room.cx/room.cy, live — same convention as the
// rest of the harness (drag-to-move, annotations). The preview grid below
// the controls is read-only: it always shows exactly what rasterizeRoom(room)
// would produce for the currently-selected type/param/size, so there's never
// a gap between what's previewed and what gets applied.
import { rasterizeRoom } from '@dungeon-forge/core';

const CELL_PADDING = 3;

export const SHAPE_TYPES = [
  { type: 'rect', label: 'Retângulo', param: null },
  {
    type: 'l', label: 'L',
    param: {
      key: 'corner', label: 'Canto',
      options: [
        { value: 'nw', label: 'Noroeste' },
        { value: 'ne', label: 'Nordeste' },
        { value: 'sw', label: 'Sudoeste' },
        { value: 'se', label: 'Sudeste' },
      ],
    },
  },
  { type: 'cross', label: 'Cruz', param: null },
  { type: 'circle', label: 'Círculo', param: null },
  {
    type: 'triangle', label: 'Triângulo',
    param: {
      key: 'orientation', label: 'Orientação',
      options: [
        { value: 'up', label: 'Cima' },
        { value: 'down', label: 'Baixo' },
        { value: 'left', label: 'Esquerda' },
        { value: 'right', label: 'Direita' },
      ],
    },
  },
];

export function defaultParamsFor(type) {
  const def = SHAPE_TYPES.find((s) => s.type === type);
  if (!def?.param) return {};
  return { [def.param.key]: def.param.options[0].value };
}

export function smallRoomWarningApplies(type, w, h) {
  return type !== 'rect' && (w < 4 || h < 4);
}

export function buildShapeEditorSVG(room, dungeon, gridSize) {
  const areaX = Math.max(0, room.x - CELL_PADDING);
  const areaY = Math.max(0, room.y - CELL_PADDING);
  const areaMaxX = Math.min(dungeon.width, room.x + room.w + CELL_PADDING);
  const areaMaxY = Math.min(dungeon.height, room.y + room.h + CELL_PADDING);
  const cols = areaMaxX - areaX;
  const rows = areaMaxY - areaY;

  const cells = rasterizeRoom(room).map((cell) => {
    const gx = cell.x - areaX;
    const gy = cell.y - areaY;
    return `<rect class="shape-cell-on" x="${gx * gridSize}" y="${gy * gridSize}" width="${gridSize}" height="${gridSize}" />`;
  }).join('');

  return `<svg class="shape-editor-svg" viewBox="0 0 ${cols * gridSize} ${rows * gridSize}" xmlns="http://www.w3.org/2000/svg">
    <rect class="shape-editor-bg" x="0" y="0" width="${cols * gridSize}" height="${rows * gridSize}" />
    ${cells}
  </svg>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run harness/test/shape-editor.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Delete the old `cell-editor.js`**

```bash
git rm harness/src/cell-editor.js
```

(There is no `cell-editor.test.js` to remove — no test file for it was ever created.)

- [ ] **Step 6: Update `room-manager.js`**

Read `harness/src/room-manager.js` in full first (it was last modified in the prior PR's session and its exact current line numbers may have shifted from what's quoted in the design doc). Make these changes:

Replace the import line:
```js
import { rectToCellSet, cellSetToBoundingRect, buildCellGridSVG, wireCellGridToggle } from './cell-editor.js';
```
with:
```js
import { SHAPE_TYPES, defaultParamsFor, smallRoomWarningApplies, buildShapeEditorSVG } from './shape-editor.js';
```

Replace the existing constant declaration:
```js
const CELL_EDITOR_GRID_SIZE = 24;
```
with:
```js
const SHAPE_EDITOR_GRID_SIZE = 24;
```
and update its one use (inside the old `renderCellEditor`, being replaced below by `renderShapeEditor`, which already references `SHAPE_EDITOR_GRID_SIZE` under its new name).

Remove the module-level `cellSelections` Map entirely (`const cellSelections = new Map(); // roomId -> Set<"x,y">, in-memory only, resets on reload`) — there is no more per-room toggle state to track; `room.shape` lives on the room itself.

Remove `getCellSelection`, `renderCellEditor`, `applyCellSelection`, and `resetCellSelection` in full, replacing them with:

```js
function populateShapeTypeSelect() {
  el('shape-type').innerHTML = SHAPE_TYPES.map((s) => `<option value="${s.type}">${s.label}</option>`).join('');
}

function renderShapeEditor() {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  const editorEl = el('shape-editor');
  if (!room) {
    editorEl.innerHTML = '';
    return;
  }

  const type = room.shape?.type ?? 'rect';
  const def = SHAPE_TYPES.find((s) => s.type === type);
  el('shape-type').value = type;

  const paramRow = el('shape-param-row');
  if (def.param) {
    paramRow.hidden = false;
    el('shape-param-label').textContent = def.param.label;
    el('shape-param').innerHTML = def.param.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
    el('shape-param').value = room.shape?.params?.[def.param.key] ?? def.param.options[0].value;
  } else {
    paramRow.hidden = true;
  }

  el('shape-w-value').textContent = room.w;
  el('shape-h-value').textContent = room.h;

  const warning = el('shape-warning');
  if (smallRoomWarningApplies(type, room.w, room.h)) {
    warning.hidden = false;
    warning.textContent = `Formas L/cruz/círculo/triângulo exigem lado >= 4; esta sala (${room.w}x${room.h}) vira retângulo.`;
  } else {
    warning.hidden = true;
  }

  editorEl.innerHTML = buildShapeEditorSVG(room, dungeon, SHAPE_EDITOR_GRID_SIZE);
}

function applyShapeType(type) {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  if (!room) return;
  room.shape = { type, params: defaultParamsFor(type) };
  afterShapeChange();
}

function applyShapeParam(value) {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  if (!room?.shape) return;
  const def = SHAPE_TYPES.find((s) => s.type === room.shape.type);
  if (!def?.param) return;
  room.shape = { type: room.shape.type, params: { [def.param.key]: value } };
  afterShapeChange();
}

function applySizeDelta(dim, delta) {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  if (!room) return;
  const next = Math.max(1, room[dim] + delta);
  if (next === room[dim]) return;
  room[dim] = next;
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
  afterShapeChange();
}

function afterShapeChange() {
  renderShapeEditor();
  renderDetail();
  renderFloorEditor();
}
```

In `initRoomManager()`, replace the existing line
```js
  el('cell-editor-reset').addEventListener('click', resetCellSelection);
```
with:
```js
  populateShapeTypeSelect();
  el('shape-type').addEventListener('change', (e) => applyShapeType(e.target.value));
  el('shape-param').addEventListener('change', (e) => applyShapeParam(e.target.value));
  el('shape-w-minus').addEventListener('click', () => applySizeDelta('w', -1));
  el('shape-w-plus').addEventListener('click', () => applySizeDelta('w', 1));
  el('shape-h-minus').addEventListener('click', () => applySizeDelta('h', -1));
  el('shape-h-plus').addEventListener('click', () => applySizeDelta('h', 1));
```

In `setDungeon()` and `selectRoom()`, replace the call `renderCellEditor();` with `renderShapeEditor();` (both functions call it in the same place the old code did).

- [ ] **Step 7: Update `harness/index.html`**

Replace the cell-editor panel markup:
```html
        <h2>Editor de células (protótipo)</h2>
        <p id="cell-editor-note">Protótipo: clique nas células para esboçar uma forma futura. O core só entende salas retangulares hoje, então apenas o retângulo delimitador (contorno tracejado) das células marcadas é aplicado à sala.</p>
        <div id="cell-editor"></div>
        <button id="cell-editor-reset" type="button">Resetar seleção</button>
```
with:
```html
        <h2>Forma da sala</h2>
        <div id="shape-editor-controls">
          <label>Tipo
            <select id="shape-type"></select>
          </label>
          <label id="shape-param-row" hidden>
            <span id="shape-param-label"></span>
            <select id="shape-param"></select>
          </label>
          <div class="shape-size-row">
            <span>Largura</span>
            <button id="shape-w-minus" type="button">-</button>
            <span id="shape-w-value"></span>
            <button id="shape-w-plus" type="button">+</button>
          </div>
          <div class="shape-size-row">
            <span>Altura</span>
            <button id="shape-h-minus" type="button">-</button>
            <span id="shape-h-value"></span>
            <button id="shape-h-plus" type="button">+</button>
          </div>
        </div>
        <p id="shape-warning" class="empty" hidden></p>
        <div id="shape-editor"></div>
```

Replace the cell-editor CSS block:
```css
      #cell-editor-note { font-size: 0.78rem; color: #a08050; margin: 0.5rem 0; max-width: 32rem; }
      #cell-editor { max-width: 100%; overflow: auto; border: 1px solid #444; background: #161616; margin-bottom: 0.5rem; }
      .cell-editor-svg { display: block; max-width: 100%; height: auto; }
      .grid-cell { fill: #1e1e1e; stroke: #333; stroke-width: 1; cursor: pointer; }
      .grid-cell:hover { fill: #2a2a2a; }
      .grid-cell-on { fill: #2a3a2a; }
      .grid-cell-on:hover { fill: #35483a; }
      .grid-applied-rect { fill: none; stroke: #c8963e; stroke-width: 2; stroke-dasharray: 4 2; pointer-events: none; }
      #cell-editor-reset { margin-bottom: 1rem; }
```
with:
```css
      #shape-editor-controls { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
      #shape-editor-controls select { background: #1a1a1a; color: #eee; border: 1px solid #444; padding: 0.2rem; }
      .shape-size-row { display: flex; align-items: center; gap: 0.4rem; }
      .shape-size-row button { width: 1.6rem; height: 1.6rem; cursor: pointer; }
      #shape-warning { font-size: 0.78rem; color: #a08050; max-width: 32rem; }
      #shape-editor { max-width: 100%; overflow: auto; border: 1px solid #444; background: #161616; margin-bottom: 0.5rem; }
      .shape-editor-svg { display: block; max-width: 100%; height: auto; }
      .shape-editor-bg { fill: #1e1e1e; stroke: #333; stroke-width: 1; }
      .shape-cell-on { fill: #2a3a2a; stroke: #35483a; stroke-width: 1; }
```

- [ ] **Step 8: Manual verification in the running harness**

```bash
cd harness && npx vite
```

Open the printed local URL, click "Generate", select a room, and confirm: the "Forma da sala" panel shows a dropdown defaulting to "Retângulo"; switching to "L" reveals a "Canto" dropdown and the preview grid below updates to an L-shape; the width/height steppers change the room size and the preview updates; reducing width below 4 with a non-rect type shows the warning text; the room's thumbnail (above) and its outline in the floor editor (separate section) both reflect the same shape after applying.

- [ ] **Step 9: Run the full workspace test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `harness/test/shape-editor.test.js`, `room-thumbnail.test.js`, and `floor-editor.test.js`.

- [ ] **Step 10: Commit**

```bash
git add harness/src/shape-editor.js harness/src/room-manager.js harness/index.html harness/test/shape-editor.test.js
git commit -m "feat(harness): replace free-form cell toggle with a macro shape type/parameter/size editor"
```

---

## Final check

Run `npx vitest run` and `npm run lint` from the repo root once more after all 4 tasks — both must be clean before moving to whole-branch review.
