# Room Shape Generalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `packages/core` generate rooms shaped as L, cross, circle, or triangle (not just rectangles), selected per-room via a weighted, config-editable table, with zero behavior change for any config that doesn't opt in.

**Architecture:** A new `roomIdAt: Uint16Array` parallel to the cell grid becomes the single source of truth for "which room owns this cell" (rooms keep their existing `x,y,w,h` bounding box for everything that only needs position). A new `shapes.js` module provides one pure rasterizer function per shape type, each returning the list of absolute `{x,y}` cells belonging to a room of that shape. `placeRooms` picks a shape per room from the weighted table (RNG-driven, same substream as the rest of the stage); `pipeline.js` rasterizes and stamps `CELL.ROOM` + `roomIdAt` after room positions are finalized; `extractWalls` is rewritten to walk each room's real cell membership (via `roomIdAt`) instead of assuming a rectangle. `carve.js` and `05-vertical-links.js` need no changes — the design guarantees their existing rectangle-based logic keeps working.

**Tech Stack:** Vanilla JS (no framework), Vitest for tests, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-room-shape-generalization-design.md`

## Global Constraints

- No `Math.random` anywhere — every random choice consumes from the `Rng` passed into the stage (SPEC.md §5.1).
- Zero behavior change when `RoomParams.shapes` is absent from config — every existing test must keep passing unmodified unless the task explicitly says to update it.
- Every shape rasterizer MUST include the cell `(Math.round(room.cx), Math.round(room.cy))` in its output — this is what keeps `carve.js`'s `roomBoundaryCell` correct with zero changes to `carve.js`.
- `packages/render`, `adapter-foundry`, and `harness/` are out of scope — do not touch them.

---

## Task 1: `rng.js` — weighted pick helper

**Files:**
- Modify: `packages/core/src/rng.js`
- Test: `packages/core/test/rng.test.js`

**Interfaces:**
- Produces: `rng.weightedPick(entries, weightFn)` — `entries` is a non-empty array, `weightFn(entry) => number` returns a positive relative weight. Returns one element of `entries`, drawn from `rng.float()` proportional to weight.

- [ ] **Step 1: Write the failing test**

Check whether `packages/core/test/rng.test.js` already exists first (`ls packages/core/test/`). If it exists, append to it; if not, create it with this content:

```js
import { describe, it, expect } from 'vitest';
import { deriveRng } from '../src/rng.js';

describe('Rng.weightedPick', () => {
  it('always returns an entry with zero weight everywhere else', () => {
    const rng = deriveRng('seed-1', 'weighted-pick');
    const entries = [{ id: 'a', weight: 0 }, { id: 'b', weight: 1 }, { id: 'c', weight: 0 }];
    for (let i = 0; i < 20; i++) {
      expect(rng.weightedPick(entries, (e) => e.weight).id).toBe('b');
    }
  });

  it('is deterministic for the same seed', () => {
    const entries = [{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }, { id: 'c', weight: 3 }];
    const rngA = deriveRng('seed-2', 'weighted-pick');
    const rngB = deriveRng('seed-2', 'weighted-pick');
    const picksA = Array.from({ length: 30 }, () => rngA.weightedPick(entries, (e) => e.weight).id);
    const picksB = Array.from({ length: 30 }, () => rngB.weightedPick(entries, (e) => e.weight).id);
    expect(picksA).toEqual(picksB);
  });

  it('over many draws, picks each entry roughly proportional to its weight', () => {
    const rng = deriveRng('seed-3', 'weighted-pick');
    const entries = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
    const counts = { a: 0, b: 0 };
    const n = 4000;
    for (let i = 0; i < n; i++) counts[rng.weightedPick(entries, (e) => e.weight).id]++;
    // Expect ~25%/75% split; generous tolerance since this is a statistical check.
    expect(counts.a / n).toBeGreaterThan(0.15);
    expect(counts.a / n).toBeLessThan(0.35);
  });

  it('single-entry table always returns that entry', () => {
    const rng = deriveRng('seed-4', 'weighted-pick');
    const entries = [{ id: 'only', weight: 1 }];
    expect(rng.weightedPick(entries, (e) => e.weight).id).toBe('only');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/rng.test.js`
Expected: FAIL with "rng.weightedPick is not a function"

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/rng.js`, inside `buildRng(floatFn)`'s returned object (alongside `pick`, `shuffle`, `chance`), add:

```js
    weightedPick(entries, weightFn) {
      const total = entries.reduce((sum, e) => sum + weightFn(e), 0);
      let roll = floatFn() * total;
      for (const entry of entries) {
        roll -= weightFn(entry);
        if (roll < 0) return entry;
      }
      return entries[entries.length - 1];
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/rng.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rng.js packages/core/test/rng.test.js
git commit -m "feat(core): add Rng.weightedPick for weighted table selection"
```

---

## Task 2: `grid.js` — per-cell room-id tracking

**Files:**
- Modify: `packages/core/src/grid.js`
- Test: `packages/core/test/grid.test.js`

**Interfaces:**
- Produces: `NO_ROOM` (constant, `0xffff`), `createRoomIdGrid(width, height, floors) => Uint16Array` (filled with `NO_ROOM`), `getRoomId(roomIdAt, x, y, z, width, height) => number`, `setRoomId(roomIdAt, x, y, z, width, height, roomId)`.
- Consumes: `cellIndex` (already exported by this same file).

- [ ] **Step 1: Write the failing test**

Check whether `packages/core/test/grid.test.js` already exists (`ls packages/core/test/`). If it exists, append; otherwise create with:

```js
import { describe, it, expect } from 'vitest';
import { NO_ROOM, createRoomIdGrid, getRoomId, setRoomId } from '../src/grid.js';

describe('room-id grid', () => {
  it('starts every cell as NO_ROOM', () => {
    const roomIdAt = createRoomIdGrid(5, 5, 2);
    expect(roomIdAt.length).toBe(5 * 5 * 2);
    expect(Array.from(roomIdAt).every((v) => v === NO_ROOM)).toBe(true);
  });

  it('set/get round-trips a room id at a specific cell', () => {
    const roomIdAt = createRoomIdGrid(5, 5, 2);
    setRoomId(roomIdAt, 2, 3, 1, 5, 5, 7);
    expect(getRoomId(roomIdAt, 2, 3, 1, 5, 5)).toBe(7);
    // Neighboring cell and other floor stay untouched.
    expect(getRoomId(roomIdAt, 2, 3, 0, 5, 5)).toBe(NO_ROOM);
    expect(getRoomId(roomIdAt, 3, 3, 1, 5, 5)).toBe(NO_ROOM);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/grid.test.js`
Expected: FAIL with "createRoomIdGrid is not a function" (or similar import error)

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/grid.js`, append:

```js
export const NO_ROOM = 0xffff;

/** @param {number} width @param {number} height @param {number} floors */
export function createRoomIdGrid(width, height, floors) {
  return new Uint16Array(width * height * floors).fill(NO_ROOM);
}

export function getRoomId(roomIdAt, x, y, z, width, height) {
  return roomIdAt[cellIndex(x, y, z, width, height)];
}

export function setRoomId(roomIdAt, x, y, z, width, height, roomId) {
  roomIdAt[cellIndex(x, y, z, width, height)] = roomId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/grid.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/grid.js packages/core/test/grid.test.js
git commit -m "feat(core): add roomIdAt grid helpers (NO_ROOM, createRoomIdGrid, get/setRoomId)"
```

---

## Task 3: `shapes.js` — rectangle rasterizer + dispatcher

**Files:**
- Create: `packages/core/src/shapes.js`
- Test: `packages/core/test/shapes.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure geometry over a `Room`-shaped object: `{x,y,w,h,cx,cy}`).
- Produces: `rasterizeRect(room) => Array<{x,y}>`, `rasterizeRoom(room) => Array<{x,y}>` (dispatches on `room.shape?.type`, defaults to `'rect'` when `room.shape` is absent — every later task and the final pipeline call this, never the per-shape functions directly, except in tests).

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/shapes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rasterizeRect, rasterizeRoom } from '../src/shapes.js';

function room(x, y, w, h, shape) {
  return { id: 0, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [], shape };
}

describe('rasterizeRect', () => {
  it('returns exactly the bounding box cells', () => {
    const r = room(2, 3, 4, 3);
    const cells = rasterizeRect(r);
    expect(cells).toHaveLength(4 * 3);
    const key = (c) => `${c.x},${c.y}`;
    const set = new Set(cells.map(key));
    for (let y = 3; y < 6; y++) {
      for (let x = 2; x < 6; x++) {
        expect(set.has(`${x},${y}`)).toBe(true);
      }
    }
  });

  it('contains the rounded centroid', () => {
    const r = room(0, 0, 5, 5);
    const cells = rasterizeRect(r);
    const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
    expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
  });
});

describe('rasterizeRoom dispatcher', () => {
  it('defaults to rect when room.shape is absent', () => {
    const r = room(1, 1, 3, 3, undefined);
    expect(rasterizeRoom(r)).toEqual(rasterizeRect(r));
  });

  it('defaults to rect when room.shape.type is "rect"', () => {
    const r = room(1, 1, 3, 3, { type: 'rect', params: {} });
    expect(rasterizeRoom(r)).toEqual(rasterizeRect(r));
  });

  it('throws on an unknown shape type', () => {
    const r = room(1, 1, 3, 3, { type: 'nonsense', params: {} });
    expect(() => rasterizeRoom(r)).toThrow(/unknown shape type/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: FAIL with a module-not-found error for `../src/shapes.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/shapes.js`:

```js
// packages/core/src/shapes.js
//
// Each rasterize<Shape> function is pure: (room) => Array<{x,y}> of absolute
// grid cells belonging to that room. Every rasterizer MUST include
// (Math.round(room.cx), Math.round(room.cy)) in its output — carve.js's
// roomBoundaryCell relies on that cell always being a real CELL.ROOM cell of
// this room, and changing that contract would require changes to carve.js
// this design deliberately avoids (see the design doc).

export function rasterizeRect(room) {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * @param {import('./types.js').Room} room
 * @returns {Array<{x:number,y:number}>}
 */
export function rasterizeRoom(room) {
  const type = room.shape?.type ?? 'rect';
  switch (type) {
    case 'rect':
      return rasterizeRect(room);
    default:
      throw new Error(`rasterizeRoom: unknown shape type "${type}"`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shapes.js packages/core/test/shapes.test.js
git commit -m "feat(core): add shapes.js with rasterizeRect and rasterizeRoom dispatcher"
```

---

## Task 4: `shapes.js` — L-shape rasterizer

**Files:**
- Modify: `packages/core/src/shapes.js`
- Modify: `packages/core/test/shapes.test.js`

**Interfaces:**
- Produces: `rasterizeL(room, params) => Array<{x,y}>` where `params = {corner: 'nw'|'ne'|'sw'|'se'}`; `sampleShapeParams('l', rng) => {corner}`; `rasterizeRoom` gains a `'l'` case.
- Consumes: `Rng` (from `rng.js`) inside `sampleShapeParams` only — `rng.pick`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/shapes.test.js`:

```js
import { deriveRng } from '../src/rng.js';
import { rasterizeL, sampleShapeParams } from '../src/shapes.js';

describe('rasterizeL', () => {
  const corners = ['nw', 'ne', 'sw', 'se'];

  it('contains the rounded centroid for every corner and a range of sizes', () => {
    for (const corner of corners) {
      for (const [w, h] of [[3, 3], [4, 5], [6, 6], [10, 7]]) {
        const r = room(0, 0, w, h);
        const cells = rasterizeL(r, { corner });
        const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
        expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
      }
    }
  });

  it('is strictly fewer cells than the full bounding box for large-enough rooms', () => {
    const r = room(0, 0, 8, 8);
    const cells = rasterizeL(r, { corner: 'ne' });
    expect(cells.length).toBeLessThan(r.w * r.h);
  });

  it('every returned cell is within the bounding box', () => {
    const r = room(5, 5, 7, 6);
    const cells = rasterizeL(r, { corner: 'sw' });
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(r.x);
      expect(c.x).toBeLessThan(r.x + r.w);
      expect(c.y).toBeGreaterThanOrEqual(r.y);
      expect(c.y).toBeLessThan(r.y + r.h);
    }
  });
});

describe('sampleShapeParams("l", rng)', () => {
  it('returns one of the four corners, deterministically for a given seed', () => {
    const rngA = deriveRng('seed-l', 'shape-params');
    const rngB = deriveRng('seed-l', 'shape-params');
    const a = sampleShapeParams('l', rngA);
    const b = sampleShapeParams('l', rngB);
    expect(['nw', 'ne', 'sw', 'se']).toContain(a.corner);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: FAIL with "rasterizeL is not a function"

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/shapes.js`, add:

```js
export function rasterizeL(room, params) {
  const notchW = Math.floor((room.w - 1) / 3);
  const notchH = Math.floor((room.h - 1) / 3);
  const notchXStart = params.corner === 'ne' || params.corner === 'se' ? room.w - notchW : 0;
  const notchYStart = params.corner === 'sw' || params.corner === 'se' ? room.h - notchH : 0;

  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const inNotch =
        dx >= notchXStart && dx < notchXStart + notchW &&
        dy >= notchYStart && dy < notchYStart + notchH;
      if (!inNotch) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}

/**
 * @param {'rect'|'l'|'cross'|'circle'|'triangle'} type
 * @param {import('./rng.js').Rng} rng
 */
export function sampleShapeParams(type, rng) {
  switch (type) {
    case 'l':
      return { corner: rng.pick(['nw', 'ne', 'sw', 'se']) };
    default:
      return {};
  }
}
```

Update the `rasterizeRoom` switch to add:

```js
    case 'l':
      return rasterizeL(room, room.shape.params);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: PASS (all tests so far)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shapes.js packages/core/test/shapes.test.js
git commit -m "feat(core): add rasterizeL shape and sampleShapeParams"
```

---

## Task 5: `shapes.js` — cross-shape rasterizer

**Files:**
- Modify: `packages/core/src/shapes.js`
- Modify: `packages/core/test/shapes.test.js`

**Interfaces:**
- Produces: `rasterizeCross(room) => Array<{x,y}>` (no shape-specific params — always symmetric); `rasterizeRoom` gains a `'cross'` case; `sampleShapeParams('cross', rng)` returns `{}`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/shapes.test.js`:

```js
import { rasterizeCross } from '../src/shapes.js';

describe('rasterizeCross', () => {
  it('contains the rounded centroid for a range of sizes', () => {
    for (const [w, h] of [[3, 3], [4, 5], [6, 6], [10, 7]]) {
      const r = room(0, 0, w, h);
      const cells = rasterizeCross(r);
      const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
      expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
    }
  });

  it('excludes all four corners for a large-enough room', () => {
    const r = room(0, 0, 9, 9);
    const cells = rasterizeCross(r);
    const set = new Set(cells.map((c) => `${c.x},${c.y}`));
    // Corner cells of the bbox should be excluded.
    expect(set.has(`${r.x},${r.y}`)).toBe(false);
    expect(set.has(`${r.x + r.w - 1},${r.y}`)).toBe(false);
    expect(set.has(`${r.x},${r.y + r.h - 1}`)).toBe(false);
    expect(set.has(`${r.x + r.w - 1},${r.y + r.h - 1}`)).toBe(false);
  });

  it('is strictly fewer cells than the full bounding box for large-enough rooms', () => {
    const r = room(0, 0, 9, 9);
    const cells = rasterizeCross(r);
    expect(cells.length).toBeLessThan(r.w * r.h);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: FAIL with "rasterizeCross is not a function"

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/shapes.js`, add:

```js
export function rasterizeCross(room) {
  const notchW = Math.floor((room.w - 1) / 3);
  const notchH = Math.floor((room.h - 1) / 3);

  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const inVerticalArm = dx >= notchW && dx < room.w - notchW;
      const inHorizontalArm = dy >= notchH && dy < room.h - notchH;
      if (inVerticalArm || inHorizontalArm) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}
```

Update `rasterizeRoom`'s switch:

```js
    case 'cross':
      return rasterizeCross(room);
```

`sampleShapeParams`'s `default: return {};` branch already covers `'cross'` — no change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: PASS (all tests so far)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shapes.js packages/core/test/shapes.test.js
git commit -m "feat(core): add rasterizeCross shape"
```

---

## Task 6: `shapes.js` — circle rasterizer

**Files:**
- Modify: `packages/core/src/shapes.js`
- Modify: `packages/core/test/shapes.test.js`

**Interfaces:**
- Produces: `rasterizeCircle(room) => Array<{x,y}>`; `rasterizeRoom` gains a `'circle'` case.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/shapes.test.js`:

```js
import { rasterizeCircle } from '../src/shapes.js';

describe('rasterizeCircle', () => {
  it('contains the rounded centroid for a range of sizes', () => {
    for (const [w, h] of [[3, 3], [4, 5], [6, 6], [10, 7]]) {
      const r = room(0, 0, w, h);
      const cells = rasterizeCircle(r);
      const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
      expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
    }
  });

  it('excludes all four corners for a large-enough room', () => {
    const r = room(0, 0, 9, 9);
    const cells = rasterizeCircle(r);
    const set = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(set.has(`${r.x},${r.y}`)).toBe(false);
    expect(set.has(`${r.x + r.w - 1},${r.y}`)).toBe(false);
    expect(set.has(`${r.x},${r.y + r.h - 1}`)).toBe(false);
    expect(set.has(`${r.x + r.w - 1},${r.y + r.h - 1}`)).toBe(false);
  });

  it('every returned cell is within the bounding box', () => {
    const r = room(3, 3, 9, 7);
    const cells = rasterizeCircle(r);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(r.x);
      expect(c.x).toBeLessThan(r.x + r.w);
      expect(c.y).toBeGreaterThanOrEqual(r.y);
      expect(c.y).toBeLessThan(r.y + r.h);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: FAIL with "rasterizeCircle is not a function"

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/shapes.js`, add:

```js
export function rasterizeCircle(room) {
  const rw = room.w / 2;
  const rh = room.h / 2;
  const cx = room.x + rw;
  const cy = room.y + rh;

  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const px = room.x + dx + 0.5;
      const py = room.y + dy + 0.5;
      const nx = (px - cx) / rw;
      const ny = (py - cy) / rh;
      if (nx * nx + ny * ny <= 1) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}
```

Update `rasterizeRoom`'s switch:

```js
    case 'circle':
      return rasterizeCircle(room);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: PASS (all tests so far)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shapes.js packages/core/test/shapes.test.js
git commit -m "feat(core): add rasterizeCircle shape"
```

---

## Task 7: `shapes.js` — triangle rasterizer

**Files:**
- Modify: `packages/core/src/shapes.js`
- Modify: `packages/core/test/shapes.test.js`

**Interfaces:**
- Produces: `rasterizeTriangle(room, params) => Array<{x,y}>` where `params = {orientation: 'up'|'down'|'left'|'right'}`; `sampleShapeParams('triangle', rng)` returns `{orientation}`; `rasterizeRoom` gains a `'triangle'` case.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/shapes.test.js`:

```js
import { rasterizeTriangle } from '../src/shapes.js';

describe('rasterizeTriangle', () => {
  const orientations = ['up', 'down', 'left', 'right'];

  it('contains the rounded centroid for every orientation and a range of sizes', () => {
    for (const orientation of orientations) {
      for (const [w, h] of [[4, 4], [5, 7], [8, 3], [9, 9]]) {
        const r = room(0, 0, w, h);
        const cells = rasterizeTriangle(r, { orientation });
        const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
        expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
      }
    }
  });

  it('is strictly fewer cells than the full bounding box for large-enough rooms', () => {
    const r = room(0, 0, 9, 9);
    for (const orientation of orientations) {
      expect(rasterizeTriangle(r, { orientation }).length).toBeLessThan(r.w * r.h);
    }
  });

  it('every returned cell is within the bounding box', () => {
    const r = room(4, 4, 8, 6);
    for (const orientation of orientations) {
      for (const c of rasterizeTriangle(r, { orientation })) {
        expect(c.x).toBeGreaterThanOrEqual(r.x);
        expect(c.x).toBeLessThan(r.x + r.w);
        expect(c.y).toBeGreaterThanOrEqual(r.y);
        expect(c.y).toBeLessThan(r.y + r.h);
      }
    }
  });

  it('throws on an unknown orientation', () => {
    const r = room(0, 0, 5, 5);
    expect(() => rasterizeTriangle(r, { orientation: 'sideways' })).toThrow(/unknown orientation/);
  });
});

describe('sampleShapeParams("triangle", rng)', () => {
  it('returns one of the four orientations, deterministically for a given seed', () => {
    const rngA = deriveRng('seed-tri', 'shape-params');
    const rngB = deriveRng('seed-tri', 'shape-params');
    const a = sampleShapeParams('triangle', rngA);
    const b = sampleShapeParams('triangle', rngB);
    expect(['up', 'down', 'left', 'right']).toContain(a.orientation);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: FAIL with "rasterizeTriangle is not a function"

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/shapes.js`, add:

```js
function inTriangle(dx, dy, w, h, orientation) {
  switch (orientation) {
    case 'up': {
      const rowFrac = (dy + 1) / h;
      const halfWidth = (rowFrac * w) / 2;
      const center = w / 2;
      return dx + 0.5 >= center - halfWidth && dx + 0.5 <= center + halfWidth;
    }
    case 'down': {
      const rowFrac = (h - dy) / h;
      const halfWidth = (rowFrac * w) / 2;
      const center = w / 2;
      return dx + 0.5 >= center - halfWidth && dx + 0.5 <= center + halfWidth;
    }
    case 'left': {
      const colFrac = (dx + 1) / w;
      const halfHeight = (colFrac * h) / 2;
      const center = h / 2;
      return dy + 0.5 >= center - halfHeight && dy + 0.5 <= center + halfHeight;
    }
    case 'right': {
      const colFrac = (w - dx) / w;
      const halfHeight = (colFrac * h) / 2;
      const center = h / 2;
      return dy + 0.5 >= center - halfHeight && dy + 0.5 <= center + halfHeight;
    }
    default:
      throw new Error(`rasterizeTriangle: unknown orientation "${orientation}"`);
  }
}

export function rasterizeTriangle(room, params) {
  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      if (inTriangle(dx, dy, room.w, room.h, params.orientation)) {
        cells.push({ x: room.x + dx, y: room.y + dy });
      }
    }
  }
  return cells;
}
```

Update `sampleShapeParams`'s switch to add:

```js
    case 'triangle':
      return { orientation: rng.pick(['up', 'down', 'left', 'right']) };
```

Update `rasterizeRoom`'s switch:

```js
    case 'triangle':
      return rasterizeTriangle(room, room.shape.params);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/shapes.test.js`
Expected: PASS (all tests so far — this is the last shapes.js task, so run the whole file and confirm every `describe` block passes)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shapes.js packages/core/test/shapes.test.js
git commit -m "feat(core): add rasterizeTriangle shape, completing the shape catalog"
```

---

## Task 8: `types.js` + `01-place-rooms.js` — assign a shape per room

**Files:**
- Modify: `packages/core/src/types.js`
- Modify: `packages/core/src/stages/01-place-rooms.js`
- Modify: `packages/core/test/stages/01-place-rooms.test.js`

**Interfaces:**
- Consumes: `sampleShapeParams(type, rng)` (Task 4/5/7, `shapes.js`); `rng.weightedPick(entries, weightFn)` (Task 1).
- Produces: every promoted `Room` returned by `placeRooms` now carries `room.shape = {type, params}`. `RoomParams.shapes` is a new optional config field.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/stages/01-place-rooms.test.js`:

```js
describe('placeRooms — shape selection', () => {
  it('defaults every room to shape.type "rect" when params.shapes is absent', () => {
    const { rooms } = placeRooms(PARAMS, 0, deriveRng('seed-shape-1', 'place-rooms'));
    for (const r of rooms) {
      expect(r.shape).toEqual({ type: 'rect', params: {} });
    }
  });

  it('only ever picks shape types present in params.shapes with weight > 0', () => {
    const params = { ...PARAMS, shapes: [{ type: 'rect', weight: 0 }, { type: 'circle', weight: 1 }] };
    const { rooms } = placeRooms(params, 0, deriveRng('seed-shape-2', 'place-rooms'));
    for (const r of rooms) {
      expect(r.shape.type).toBe('circle');
    }
  });

  it('is deterministic for the same seed, including shape assignment', () => {
    const params = {
      ...PARAMS,
      shapes: [{ type: 'rect', weight: 1 }, { type: 'l', weight: 1 }, { type: 'triangle', weight: 1 }],
    };
    const a = placeRooms(params, 0, deriveRng('seed-shape-3', 'place-rooms'));
    const b = placeRooms(params, 0, deriveRng('seed-shape-3', 'place-rooms'));
    expect(a.rooms.map((r) => r.shape)).toEqual(b.rooms.map((r) => r.shape));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/stages/01-place-rooms.test.js`
Expected: FAIL — `r.shape` is `undefined`

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/types.js`, after the closing `*/` of the existing `RoomParams` typedef, add a new typedef and extend `RoomParams`:

```js
/**
 * @typedef {Object} RoomShapeEntry
 * @property {'rect'|'l'|'cross'|'circle'|'triangle'} type
 * @property {number} weight            // relative weight, need not sum to 1
 */
```

Then edit the existing `RoomParams` typedef to add one line before its closing `*/`:

```js
 * @property {RoomShapeEntry[]} [shapes]  // default: [{type:'rect', weight:1}]
```

Edit the existing `Room` typedef to add one line before its closing `*/`:

```js
 * @property {{type: string, params: Object}} shape   // which shape generated this room's cells
```

In `packages/core/src/stages/01-place-rooms.js`, add the import at the top:

```js
import { sampleShapeParams } from '../shapes.js';
```

Then change the `rooms` construction (the `promoted.map(...)` block) from:

```js
  const rooms = promoted.map((b, i) => ({
    id: i,
    floor,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    cx: b.x + b.w / 2,
    cy: b.y + b.h / 2,
    role: 'filler',
    doors: [],
  }));
```

to:

```js
  const shapeTable = params.shapes ?? [{ type: 'rect', weight: 1 }];

  const rooms = promoted.map((b, i) => {
    const type = rng.weightedPick(shapeTable, (e) => e.weight).type;
    return {
      id: i,
      floor,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
      role: 'filler',
      doors: [],
      shape: { type, params: sampleShapeParams(type, rng) },
    };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/stages/01-place-rooms.test.js`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 5: Run the full core test suite to confirm no regression**

Run: `cd packages/core && npx vitest run`
Expected: PASS — every previously-passing test still passes (shape selection is additive; default config produces `shape:{type:'rect',params:{}}` on every room, which no existing test inspects)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.js packages/core/src/stages/01-place-rooms.js packages/core/test/stages/01-place-rooms.test.js
git commit -m "feat(core): placeRooms picks a shape per room from a weighted table"
```

---

## Task 9: `pipeline.js` — rasterize shapes into the grid + `roomIdAt`

**Files:**
- Modify: `packages/core/src/types.js`
- Modify: `packages/core/src/pipeline.js`
- Modify: `packages/core/test/pipeline.test.js`

**Interfaces:**
- Consumes: `rasterizeRoom(room)` (Task 3-7, `shapes.js`); `createRoomIdGrid`, `setRoomId` (Task 2, `grid.js`).
- Produces: `generateDungeon(config)`'s returned `Dungeon` object gains a `roomIdAt: Uint16Array` field. `extractWalls` is now called with `roomIdAt` as its second argument (this task updates the call site; Task 10 updates `extractWalls` itself to use it — until Task 10 lands, `extractWalls` simply ignores the extra argument since JS doesn't enforce arity, so this task's tests must NOT depend on door/wall correctness for non-rect rooms yet, only on `roomIdAt` being populated correctly).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/pipeline.test.js` (check the existing imports at the top of the file first and reuse whatever config object/helper it already builds for `generateDungeon` — if the file has a shared `CONFIG` constant or builder function, use it; otherwise inline a minimal config matching the shape below):

```js
import { getRoomId, NO_ROOM } from '../src/grid.js';

describe('generateDungeon — roomIdAt', () => {
  it('every CELL.ROOM cell has a matching roomIdAt entry, and every other cell is NO_ROOM', () => {
    const config = {
      seed: 'roomid-1', floors: 1, width: 40, height: 40,
      rooms: { count: 6, sizeMean: 6, sizeStdDev: 2, sizeMin: 3, sizeMax: 10, spawnRadius: 14, separationIters: 40 },
      cycleRate: 0.25, verticalLinksPerGap: 2,
      carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
      pruneIterations: 8,
      key: { scheme: 'flat', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
    };
    const dungeon = generateDungeon(config);
    expect(dungeon.roomIdAt).toBeInstanceOf(Uint16Array);
    expect(dungeon.roomIdAt.length).toBe(dungeon.cells.length);

    for (let i = 0; i < dungeon.cells.length; i++) {
      const y = Math.floor(i / config.width) % config.height;
      const x = i % config.width;
      const z = Math.floor(i / (config.width * config.height));
      const cellValue = dungeon.cells[i];
      const roomId = getRoomId(dungeon.roomIdAt, x, y, z, config.width, config.height);
      if (cellValue === 1 /* CELL.ROOM */) {
        expect(roomId).not.toBe(NO_ROOM);
        expect(dungeon.rooms.some((r) => r.id === roomId)).toBe(true);
      } else {
        expect(roomId).toBe(NO_ROOM);
      }
    }
  });

  it('with an all-circle shape table, every room still has its centroid cell as CELL.ROOM', () => {
    const config = {
      seed: 'roomid-2', floors: 1, width: 40, height: 40,
      rooms: {
        count: 6, sizeMean: 6, sizeStdDev: 2, sizeMin: 4, sizeMax: 10, spawnRadius: 14, separationIters: 40,
        shapes: [{ type: 'circle', weight: 1 }],
      },
      cycleRate: 0.25, verticalLinksPerGap: 2,
      carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
      pruneIterations: 8,
      key: { scheme: 'flat', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
    };
    const dungeon = generateDungeon(config);
    for (const room of dungeon.rooms) {
      expect(room.shape.type).toBe('circle');
      const cx = Math.round(room.cx);
      const cy = Math.round(room.cy);
      expect(dungeon.cells[cy * config.width + cx]).toBe(1 /* CELL.ROOM */);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/pipeline.test.js`
Expected: FAIL — `dungeon.roomIdAt` is `undefined`

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/pipeline.js`:

Add imports:

```js
import { CELL, createGrid, setCell, createRoomIdGrid, setRoomId } from './grid.js';
import { rasterizeRoom } from './shapes.js';
```

(This replaces the existing `import { CELL, createGrid, setCell } from './grid.js';` line — add the two new names to the same import instead of a second import line.)

Right after `const grid = createGrid(config.width, config.height, config.floors);`, add:

```js
  const roomIdAt = createRoomIdGrid(config.width, config.height, config.floors);
```

Replace the cell-stamping loop:

```js
    for (const room of floorRooms) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          setCell(grid, x, y, floor, config.width, config.height, CELL.ROOM);
        }
      }
    }
```

with:

```js
    for (const room of floorRooms) {
      for (const cell of rasterizeRoom(room)) {
        setCell(grid, cell.x, cell.y, floor, config.width, config.height, CELL.ROOM);
        setRoomId(roomIdAt, cell.x, cell.y, floor, config.width, config.height, room.id);
      }
    }
```

Update the `extractWalls` call site from:

```js
    const { walls: floorWalls, doors: floorDoors } = extractWalls(
      grid, config.width, config.height, floor, floorRooms
    );
```

to:

```js
    const { walls: floorWalls, doors: floorDoors } = extractWalls(
      grid, roomIdAt, config.width, config.height, floor, floorRooms
    );
```

Add `roomIdAt` to the object returned at the end of `generateDungeon`, alongside `cells: grid,`:

```js
    cells: grid,
    roomIdAt,
```

In `packages/core/src/types.js`, add one line to the `Dungeon` typedef before its closing `*/`:

```js
 * @property {Uint16Array} roomIdAt     // parallel to cells; NO_ROOM (grid.js) where no room owns the cell
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/pipeline.test.js`
Expected: PASS. Note: `extractWalls` at this point in the plan still has its OLD signature (`grid, width, height, floor, rooms`) — the call site above now passes `roomIdAt` as the second positional argument where `width` used to be, which WILL break every other pipeline test that exercises wall/door output (extra unused arg shifts every subsequent parameter). This is expected and intentional: Task 10 fixes `extractWalls` itself immediately after. Do not attempt to work around it in this task.

Run the full suite to see the expected breakage: `cd packages/core && npx vitest run`
Expected: the two new tests in `pipeline.test.js` PASS (they only check `roomIdAt`, not walls/doors); tests touching walls/doors/rendering FAIL with nonsensical dimensions — confirm the failures are all downstream of the `extractWalls` argument shift (errors mentioning wall coordinates, door counts, or `inBounds`), not something else. If any failure looks unrelated to the argument shift, stop and investigate before continuing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pipeline.js packages/core/src/types.js packages/core/test/pipeline.test.js
git commit -m "feat(core): rasterize room shapes into the grid, add roomIdAt to Dungeon

Known-broken intermediate state: extractWalls's signature hasn't been
updated yet (next commit), so every wall/door-dependent test fails here.
This is expected — see Task 10."
```

---

## Task 10: `extract-walls.js` — walk real room shape, not bounding box

**Files:**
- Modify: `packages/core/src/stages/10-extract-walls.js`
- Modify: `packages/core/src/pipeline.js` (no change expected — verify only)
- Modify: `packages/core/test/stages/10-extract-walls.test.js`

**Interfaces:**
- Consumes: `getRoomId` (Task 2, `grid.js`).
- Produces: `extractWalls(grid, roomIdAt, width, height, floor, rooms)` — signature changes (new 2nd parameter). Returns the same `{walls, doors}` shape as before; `Door.dir` is still populated, now derived without `doorDirection`.

- [ ] **Step 1: Update all existing test call sites (still expected to fail first)**

In `packages/core/test/stages/10-extract-walls.test.js`, add the import:

```js
import { createRoomIdGrid, setRoomId } from '../../src/grid.js';
```

Add a helper right after the existing `stamp` helper:

```js
function stampRoomId(roomIdAt, width, height, roomId, x, y, w, h) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setRoomId(roomIdAt, x + dx, y + dy, 0, width, height, roomId);
    }
  }
}
```

For EVERY existing `it(...)` block in this file: after each `stamp(grid, width, height, r.x, r.y, r.w, r.h, CELL.ROOM);` call (there is one per room stamped in each test), add a matching `createRoomIdGrid` + `stampRoomId` pair, and add `roomIdAt` as the 2nd argument to every `extractWalls(...)` call. For example, the file's first test:

```js
  it('produces walls only on the boundary of a walkable region', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    const r0 = room(0, 2, 2, 4, 4);
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);

    const { walls } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      expect(w.floor).toBe(0);
    }
  });
```

Apply the same pattern (declare `roomIdAt`, `stampRoomId` per room right after its `stamp` call, add `roomIdAt` to the `extractWalls` call) to every other `it(...)` block in the file: `'fuses colinear contiguous segments into one WallSegment'`, `'marks a corridor crossing a room boundary as a door'`, `'traces each door to the room its corridor actually reaches'`, `'every WallSegment borders at least one walkable cell'`, and `'is deterministic for the same grid'`. Read each test fully first (`cat packages/core/test/stages/10-extract-walls.test.js`) to see exactly how many rooms each one stamps — multi-room tests need one `stampRoomId` call per room.

Also add this new test at the end of the `describe('extractWalls', ...)` block, exercising the actual concave-shape case this task is for:

```js
  it('detects a door on the interior wall of a concave (L-shaped) room', () => {
    const width = 14;
    const height = 14;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    // A 6x6 room with the NE corner notched out (see rasterizeL, notch = floor((6-1)/3) = 1,
    // so the notch is the single cell at the room's top-right corner: (r0.x+5, r0.y)).
    const r0 = room(0, 2, 2, 6, 6);
    const notchCell = { x: r0.x + 5, y: r0.y };
    for (let y = r0.y; y < r0.y + r0.h; y++) {
      for (let x = r0.x; x < r0.x + r0.w; x++) {
        if (x === notchCell.x && y === notchCell.y) continue;
        setCell(grid, x, y, 0, width, height, CELL.ROOM);
        setRoomId(roomIdAt, x, y, 0, width, height, r0.id);
      }
    }
    // Carve a hallway cell into the notch from outside, so the room's interior
    // (concave) wall directly below the notch has a real door opening.
    setCell(grid, notchCell.x, notchCell.y, 0, width, height, CELL.HALLWAY);

    const { doors } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
    expect(doors.some((d) => d.roomId === 0)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/stages/10-extract-walls.test.js`
Expected: FAIL — `extractWalls` doesn't yet accept `roomIdAt` (old signature reads it as `width`, producing wrong/garbage results, likely thrown range errors or wrong wall counts)

- [ ] **Step 3: Write minimal implementation**

Rewrite `packages/core/src/stages/10-extract-walls.js`'s `roomAt`, `collectDoorEdges`, `doorDirection`, `traceDestinationRoom`, and `extractWalls` as follows. Keep everything else in the file (`isWalkable`, `cellValueAt`, `collectSilhouetteEdges`, `isDoorOpening`, `fuseRuns`) unchanged.

Add the import:

```js
import { CELL, getCell, getRoomId, inBounds } from '../grid.js';
```

(replacing the existing `import { CELL, getCell, inBounds } from '../grid.js';`)

Delete the `roomAt` function entirely:

```js
function roomAt(rooms, x, y) {
  return rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}
```

Replace `collectDoorEdges` with:

```js
const DOOR_NEIGHBORS = [
  { dx: 0, dy: -1, dir: 'n' },
  { dx: 0, dy: 1, dir: 's' },
  { dx: -1, dy: 0, dir: 'w' },
  { dx: 1, dy: 0, dir: 'e' },
];

/**
 * Doors are NOT a byproduct of the silhouette pass: a room's wall directly
 * adjoining a hallway (or stair — see isDoorOpening) has no walkability
 * transition (both sides are walkable), so it never appears as a silhouette
 * edge. This pass walks every cell that actually belongs to each room (via
 * roomIdAt — the room's real shape, not its bounding box) and checks each of
 * its 4 neighbors: any neighbor outside the room's own cell membership that
 * is a door-opening is a candidate door edge, in the direction of that
 * neighbor. Sweeping the room's bounding box and skipping non-member cells
 * (rather than trying to walk just the perimeter directly) keeps this
 * correct for concave shapes (L, cross) where the "perimeter" isn't a single
 * simple loop — an inner concave wall is found the same way as an outer one.
 */
function collectDoorEdges(grid, roomIdAt, width, height, floor, rooms) {
  const horizontal = []; // door edge at row y, between (x,y-1) and (x,y)
  const vertical = [];   // door edge at column x, between (x-1,y) and (x,y)

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (getRoomId(roomIdAt, x, y, floor, width, height) !== room.id) continue;

        for (const { dx, dy, dir } of DOOR_NEIGHBORS) {
          const ox = x + dx;
          const oy = y + dy;
          if (getRoomId(roomIdAt, ox, oy, floor, width, height) === room.id) continue;

          const outsideValue = cellValueAt(grid, ox, oy, floor, width, height);
          if (!isDoorOpening(outsideValue)) continue;

          const toRoomId = traceDestinationRoom(grid, roomIdAt, width, height, floor, room.id, { x: ox, y: oy });
          const fuseGroup = `${room.id}:${toRoomId}:${dir}`;

          if (dir === 'n' || dir === 's') {
            horizontal.push({ x, y: dir === 's' ? y + 1 : y, roomId: room.id, toRoomId, fuseGroup });
          } else {
            vertical.push({ x: dir === 'e' ? x + 1 : x, y, roomId: room.id, toRoomId, fuseGroup });
          }
        }
      }
    }
  }

  return { horizontal, vertical };
}
```

Note `getRoomId(roomIdAt, ox, oy, ...)` for an out-of-bounds `(ox, oy)` will index the typed array out of range — mirror the existing `cellValueAt`'s bounds guard by adding a small wrapper right above `collectDoorEdges`:

```js
function roomIdAtCell(roomIdAt, x, y, floor, width, height) {
  if (!inBounds(x, y, floor, width, height, floor + 1)) return null;
  return getRoomId(roomIdAt, x, y, floor, width, height);
}
```

...and use `roomIdAtCell(roomIdAt, x, y, floor, width, height)` in place of the two bare `getRoomId(roomIdAt, x, y, floor, width, height)` calls inside `collectDoorEdges` above (the one checking the room's own cell, and the one checking the neighbor) — both need the same out-of-bounds safety `cellValueAt` already has.

Delete the `doorDirection` function entirely:

```js
function doorDirection(door, room) {
  if (door.y1 === door.y2) return door.y1 === room.y ? 'n' : 's';
  return door.x1 === room.x ? 'w' : 'e';
}
```

Replace `traceDestinationRoom`'s signature and its `CELL.ROOM` branch. Change:

```js
function traceDestinationRoom(grid, width, height, floor, rooms, originRoomId, start) {
  const startValue = cellValueAt(grid, start.x, start.y, floor, width, height);
  if (startValue === CELL.ROOM) {
    const r = roomAt(rooms, start.x, start.y);
    return r && r.id !== originRoomId ? r.id : null;
  }
```

to:

```js
function traceDestinationRoom(grid, roomIdAt, width, height, floor, originRoomId, start) {
  const startValue = cellValueAt(grid, start.x, start.y, floor, width, height);
  if (startValue === CELL.ROOM) {
    const id = roomIdAtCell(roomIdAt, start.x, start.y, floor, width, height);
    return id !== null && id !== originRoomId ? id : null;
  }
```

And inside the same function's BFS loop, change:

```js
      const v = getCell(grid, nx, ny, floor, width, height);
      if (v === CELL.ROOM) {
        const r = roomAt(rooms, nx, ny);
        if (r && r.id !== originRoomId) return r.id;
        continue; // don't walk through a room's interior
      }
```

to:

```js
      const v = getCell(grid, nx, ny, floor, width, height);
      if (v === CELL.ROOM) {
        const id = roomIdAtCell(roomIdAt, nx, ny, floor, width, height);
        if (id !== null && id !== originRoomId) return id;
        continue; // don't walk through a room's interior
      }
```

Update the two call sites of `traceDestinationRoom` inside `collectDoorEdges` (already written above with the new signature: `traceDestinationRoom(grid, roomIdAt, width, height, floor, room.id, { x: ox, y: oy })`) — confirm this matches.

Now update `extractWalls` itself. Change its signature and body:

```js
export function extractWalls(grid, width, height, floor, rooms) {
```

to:

```js
export function extractWalls(grid, roomIdAt, width, height, floor, rooms) {
```

Change the `collectDoorEdges` call:

```js
  const doorEdges = collectDoorEdges(grid, width, height, floor, rooms);
```

to:

```js
  const doorEdges = collectDoorEdges(grid, roomIdAt, width, height, floor, rooms);
```

Change `parseFuseGroup` from:

```js
  function parseFuseGroup(group) {
    const sep = group.indexOf(':');
    const roomId = Number(group.slice(0, sep));
    const toRoomIdStr = group.slice(sep + 1);
    return { roomId, toRoomId: toRoomIdStr === 'null' ? null : Number(toRoomIdStr) };
  }
```

to:

```js
  function parseFuseGroup(group) {
    const [roomIdStr, toRoomIdStr, dir] = group.split(':');
    return { roomId: Number(roomIdStr), toRoomId: toRoomIdStr === 'null' ? null : Number(toRoomIdStr), dir };
  }
```

Finally, in the door-construction loop, remove the now-dead `roomsById` map and the `doorDirection` call. Change:

```js
  const roomsById = new Map(rooms.map((r) => [r.id, r]));

  let nextDoorId = 0;
  const doors = [];
  for (const wall of doorWalls) {
    const doorId = nextDoorId++;
    wall.doorId = doorId;
    const room = roomsById.get(wall.roomId);
    doors.push({
      id: doorId,
      floor,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      roomId: wall.roomId,
      secret: false,
      dir: doorDirection(wall, room),
      toRoomId: wall.toRoomId,
    });
  }
```

to:

```js
  let nextDoorId = 0;
  const doors = [];
  for (const wall of doorWalls) {
    const doorId = nextDoorId++;
    wall.doorId = doorId;
    doors.push({
      id: doorId,
      floor,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      roomId: wall.roomId,
      secret: false,
      dir: wall.dir,
      toRoomId: wall.toRoomId,
    });
  }
```

Note `wall.dir` here comes from `...parseFuseGroup(s.group)` already spread into each `hDoorSegments`/`vDoorSegments` entry (look at the existing code around `hDoorSegments`/`vDoorSegments` — it already does `...parseFuseGroup(s.group)`, which now additionally yields `dir` since `parseFuseGroup` was just extended above; no change needed to the `hDoorSegments`/`vDoorSegments` construction itself).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/stages/10-extract-walls.test.js`
Expected: PASS (all tests, including the new concave-room test)

- [ ] **Step 5: Run the full core test suite**

Run: `cd packages/core && npx vitest run`
Expected: PASS — this also fixes the `pipeline.test.js` failures noted as expected in Task 9 (since `extractWalls` now correctly consumes the `roomIdAt` argument `pipeline.js` was already passing). If any test outside `pipeline.test.js` / `10-extract-walls.test.js` fails, read the failure carefully — it likely means a room helper elsewhere in the test suite (e.g. in `08-mission.test.js` or `09-key.test.js`) constructs `Room` objects and separately calls `extractWalls` directly; grep for other call sites: `grep -rn "extractWalls(" packages/core/test/` and update any you find the same way as Task 10 Step 1.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/stages/10-extract-walls.js packages/core/test/stages/10-extract-walls.test.js
git commit -m "fix(core): extractWalls walks real room cell membership via roomIdAt

Replaces the rectangle-perimeter door scan with a sweep over each room's
actual cells (bbox scan + roomIdAt membership check), so concave shapes
(L, cross) get correct door detection on interior walls. doorDirection is
removed — direction is now carried through from the per-cell neighbor scan
instead of being re-derived from bbox comparison after fusion."
```

---

## Task 11: `carve.test.js` — confirm non-rect rooms stay reachable

**Files:**
- Modify: `packages/core/test/stages/06-carve.test.js`

**Interfaces:**
- Consumes: `rasterizeL` (Task 4, `shapes.js`).
- Produces: no production code change — this task only adds a regression test confirming the design's centroid-inclusion invariant actually keeps `carve.js` working, unmodified, against a real concave shape.

- [ ] **Step 1: Write the test**

Append to `packages/core/test/stages/06-carve.test.js`:

```js
import { rasterizeL } from '../../src/shapes.js';

describe('carve — non-rectangular rooms', () => {
  it('connects two L-shaped rooms whose bbox centroid sits in the solid arm, not the notch', () => {
    const width = 24;
    const height = 24;
    const grid = createGrid(width, height, 1);

    const r0 = { ...room(0, 2, 2, 6, 6), shape: { type: 'l', params: { corner: 'ne' } } };
    const r1 = { ...room(1, 14, 14, 6, 6), shape: { type: 'l', params: { corner: 'sw' } } };

    for (const r of [r0, r1]) {
      for (const cell of rasterizeL(r, r.shape.params)) {
        setCell(grid, cell.x, cell.y, 0, width, height, CELL.ROOM);
      }
      // Sanity check the fixture matches this task's premise before trusting the rest of the test.
      expect(getCell(grid, Math.round(r.cx), Math.round(r.cy), 0, width, height)).toBe(CELL.ROOM);
    }

    carve(grid, width, height, 0, [r0, r1], [{ a: 0, b: 1, weight: 1, kind: 'mst' }], COSTS);

    const hallwayCount = Array.from(grid).filter((c) => c === CELL.HALLWAY).length;
    expect(hallwayCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/stages/06-carve.test.js`
Expected: PASS immediately — `carve.js` needs no production changes for this to work (that's the point of the test: it proves the design's centroid-inclusion invariant, not new code). If it fails, do not patch `carve.js` — first check whether `rasterizeL`'s notch calculation actually still contains `(round(cx), round(cy))` for a 6x6 room with `corner: 'ne'`/`'sw'` (re-run the relevant `shapes.test.js` cases); the bug is almost certainly in the fixture or in Task 4's implementation, not in `carve.js`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/stages/06-carve.test.js
git commit -m "test(core): confirm carve reaches L-shaped rooms via the centroid invariant"
```

---

## Task 12: `property.test.js` — mixed-shape config in the seed sweep

**Files:**
- Modify: `packages/core/test/property.test.js`

**Interfaces:**
- Consumes: `generateDungeon`, `validateDungeon` (already imported in this file).
- Produces: no production code change — adds one more entry to the existing `CONFIGS` array so the property sweep also exercises non-rectangular rooms.

- [ ] **Step 1: Add the config**

In `packages/core/test/property.test.js`, add a new entry to the `CONFIGS` array (after the existing `'single-floor, flat scheme, dense rooms'` entry):

```js
  {
    label: 'multi-floor, mixed room shapes',
    floors: 3, width: 55, height: 55,
    rooms: {
      ...ROOM_PARAMS,
      sizeMin: 4, // shape rasterizers need >=4 on a side to produce a non-degenerate notch/arm
      shapes: [
        { type: 'rect', weight: 1 },
        { type: 'l', weight: 1 },
        { type: 'cross', weight: 1 },
        { type: 'circle', weight: 1 },
        { type: 'triangle', weight: 1 },
      ],
    },
    cycleRate: 0.25, verticalLinksPerGap: 2, carve: CARVE, pruneIterations: 8,
    key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
  },
```

- [ ] **Step 2: Run the test**

Run: `cd packages/core && npx vitest run test/property.test.js`
Expected: PASS — `0/30 seeds failed validation` for the new `'multi-floor, mixed room shapes'` config, same as every other config in the file. If any seed fails, read the reported `errors` codes from `validateDungeon` (the failure message lists up to 5 failing seeds with their error codes) — this is a real bug surfaced by the property test and must be fixed in whichever stage the error code points to (do not weaken the test or exclude the failing shape type).

- [ ] **Step 3: Run the full core suite one more time**

Run: `cd packages/core && npx vitest run`
Expected: PASS, all files.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/property.test.js
git commit -m "test(core): exercise mixed room shapes in the validator property sweep"
```

---

## Final check

After Task 12, run the complete suite once more with the larger seed count to match what CI does:

```bash
cd packages/core && DUNGEON_FORGE_PROPERTY_SEEDS=2000 npx vitest run test/property.test.js
```

Expected: `0/2000 seeds failed validation` for every config, including the new mixed-shape one. This is the same bar the original multi-floor+validator work (M5/M6/M7) was held to — do not consider this plan done until it passes at 2000 seeds, not just the default 30.
