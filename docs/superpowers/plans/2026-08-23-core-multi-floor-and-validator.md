# Core Multi-Floor Pipeline + Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `packages/core` from single-floor-only to full multi-floor generation (SPEC.md M1/M5 remainder: vertical links, corridor thickening, dead-end pruning) and add the validator (`validate.js`) with a seeded property test, per SPEC.md §6 and §8's M7 milestone.

**Architecture:** Add two new pipeline stages (`05-vertical-links.js`, `07-prune.js`), extend `06-carve.js` with a point-to-point carve helper and corridor thickening, then rewrite `pipeline.js`'s `generateDungeon` to loop over floors instead of hard-rejecting `floors !== 1`. Finish with `core/src/validate.js` implementing SPEC.md §6's invariants and a configurable-seed-count property test.

**Tech Stack:** Plain JS ESM, Vitest. No new dependencies.

**Spec:** `SPEC.md` (repo root) — primarily §5.7 (`verticalLinks`), §5.8 (`carve`, including engrossamento), §5.9 (`prune`), §6 (validator invariants), §9 (testing).

**Out of scope for this plan (confirmed with the project owner):** `adapter-foundry` (M4a/M4b) and the `module` wrapper — both require golden-sample JSON exported from a real Foundry world (SPEC.md §2.4), which only the project owner can produce. Also out of scope: `render`/`harness` changes (they already work for `floors: 1`; wiring them to multi-floor is a follow-up once this plan lands). Also out of scope: `mission.criticalLinks`/`mission.optionalBranches`, which remain `[]` as they already are today — SPEC.md's "fase 2" extension (keys/locks) that these feed is explicitly deferred in §5.10.

## Global Constraints

- `Math.random` is banned repo-wide (ESLint rule in `eslint.config.js`) — always use `makeRng`/`deriveRng` from `rng.js`.
- `core` never imports DOM, Canvas, or Foundry globals, and never reads `config.target` (that field doesn't exist in `core/src/types.js` yet — it's introduced only when `adapter-foundry` lands).
- Grids are always `Uint8Array`, never arrays of objects.
- Pipeline stages are pure functions — no module-level mutable state.
- Every intermediate artifact must be serializable — if it doesn't survive `structuredClone`, it's wrong.
- Stage 9 (`key`, `09-key.js`) never receives an RNG substream — numbering is a pure function of topology. This plan does not touch `09-key.js`'s numbering logic.
- New RNG substreams must be derived via `deriveRng(seed, stageName)`, one call per stage per floor where the stage is seed-sensitive (see Task 5).

---

### Task 1: `05-vertical-links.js` — choose and stamp vertical links

**Files:**
- Create: `packages/core/src/stages/05-vertical-links.js`
- Test: `packages/core/test/stages/05-vertical-links.test.js`

**Interfaces:**
- Consumes: `CELL`, `getCell`, `setCell`, `inBounds` from `../grid.js`; `Rng` shape from `../rng.js` (`.pick(array)`).
- Produces: `chooseVerticalLinks(grid, width, height, floors, roomsByFloor, verticalLinksPerGap, rng) → VerticalLink[]`, where `roomsByFloor` is a `Map<number, Room[]>` and each returned link is `{ id, fromFloor, toFloor, x, y, w, h, kind: 'stair' }` (matches the `VerticalLink` typedef in `types.js`). Also mutates `grid` in place, setting `CELL.STAIR` on the footprint on both `fromFloor` and `toFloor`. Later tasks (5, and the pipeline rewrite) call this directly.

- [ ] **Step 1: Write the failing test**

```js
// packages/core/test/stages/05-vertical-links.test.js
import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell, getCell } from '../../src/grid.js';
import { chooseVerticalLinks } from '../../src/stages/05-vertical-links.js';
import { makeRng } from '../../src/rng.js';

function room(id, floor, x, y, w, h) {
  return { id, floor, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [] };
}

describe('chooseVerticalLinks', () => {
  it('produces verticalLinksPerGap links per adjacent floor pair', () => {
    const width = 20, height = 20, floors = 3;
    const grid = createGrid(width, height, floors);
    const roomsByFloor = new Map([
      [0, [room(0, 0, 2, 2, 4, 4), room(1, 0, 14, 14, 4, 4)]],
      [1, [room(2, 1, 2, 2, 4, 4), room(3, 1, 14, 14, 4, 4)]],
      [2, [room(4, 2, 2, 2, 4, 4), room(5, 2, 14, 14, 4, 4)]],
    ]);
    const links = chooseVerticalLinks(grid, width, height, floors, roomsByFloor, 2, makeRng('vlink-seed'));
    expect(links.length).toBe(4);
    expect(links.filter((l) => l.fromFloor === 0 && l.toFloor === 1).length).toBe(2);
    expect(links.filter((l) => l.fromFloor === 1 && l.toFloor === 2).length).toBe(2);
  });

  it('marks the footprint as CELL.STAIR on both floors it connects', () => {
    const width = 20, height = 20, floors = 2;
    const grid = createGrid(width, height, floors);
    const roomsByFloor = new Map([
      [0, [room(0, 0, 2, 2, 4, 4)]],
      [1, [room(1, 1, 2, 2, 4, 4)]],
    ]);
    const links = chooseVerticalLinks(grid, width, height, floors, roomsByFloor, 1, makeRng('vlink-seed-2'));
    expect(links.length).toBe(1);
    const link = links[0];
    expect(getCell(grid, link.x, link.y, link.fromFloor, width, height)).toBe(CELL.STAIR);
    expect(getCell(grid, link.x, link.y, link.toFloor, width, height)).toBe(CELL.STAIR);
  });

  it('is deterministic given the same seed', () => {
    const width = 30, height = 30, floors = 2;
    const roomsByFloor = new Map([
      [0, [room(0, 0, 2, 2, 4, 4), room(1, 0, 20, 20, 4, 4)]],
      [1, [room(2, 1, 2, 2, 4, 4), room(3, 1, 20, 20, 4, 4)]],
    ]);
    const gridA = createGrid(width, height, floors);
    const gridB = createGrid(width, height, floors);
    const linksA = chooseVerticalLinks(gridA, width, height, floors, roomsByFloor, 2, makeRng('det-seed'));
    const linksB = chooseVerticalLinks(gridB, width, height, floors, roomsByFloor, 2, makeRng('det-seed'));
    expect(linksA).toEqual(linksB);
  });

  it('never places a footprint overlapping a room on either floor', () => {
    const width = 20, height = 20, floors = 2;
    const grid = createGrid(width, height, floors);
    const r0 = room(0, 0, 5, 5, 6, 6);
    const r1 = room(1, 1, 5, 5, 6, 6);
    for (const [floor, r] of [[0, r0], [1, r1]]) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) setCell(grid, x, y, floor, width, height, CELL.ROOM);
      }
    }
    const roomsByFloor = new Map([[0, [r0]], [1, [r1]]]);
    const links = chooseVerticalLinks(grid, width, height, floors, roomsByFloor, 1, makeRng('overlap-seed'));
    for (const link of links) {
      for (let dy = 0; dy < link.h; dy++) {
        for (let dx = 0; dx < link.w; dx++) {
          expect(getCell(grid, link.x + dx, link.y + dy, link.fromFloor, width, height)).not.toBe(CELL.ROOM);
          expect(getCell(grid, link.x + dx, link.y + dy, link.toFloor, width, height)).not.toBe(CELL.ROOM);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/stages/05-vertical-links.test.js`
Expected: FAIL — `Cannot find module '../../src/stages/05-vertical-links.js'`

- [ ] **Step 3: Write the implementation**

```js
// packages/core/src/stages/05-vertical-links.js
import { CELL, getCell, setCell, inBounds } from '../grid.js';

const LINK_W = 2;
const LINK_H = 1;
const PROXIMITY = 3;

function rectDistance(px, py, room) {
  const dx = Math.max(room.x - px, 0, px - (room.x + room.w - 1));
  const dy = Math.max(room.y - py, 0, py - (room.y + room.h - 1));
  return Math.hypot(dx, dy);
}

function footprintFree(grid, width, height, floor, x, y) {
  for (let dy = 0; dy < LINK_H; dy++) {
    for (let dx = 0; dx < LINK_W; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (!inBounds(cx, cy, floor, width, height, floor + 1)) return false;
      if (getCell(grid, cx, cy, floor, width, height) !== CELL.EMPTY) return false;
    }
  }
  return true;
}

function nearRoom(rooms, x, y, radius) {
  return rooms.some((r) => rectDistance(x, y, r) <= radius);
}

/**
 * Collects candidate footprints for one floor gap. Prefers footprints within
 * PROXIMITY cells of a room on both floors (SPEC.md §5.7); falls back to any
 * free footprint if the strict proximity search comes up empty, so a link
 * always exists for the gap rather than silently dropping below
 * verticalLinksPerGap on a cramped seed.
 */
function collectCandidates(grid, width, height, fromFloor, toFloor, roomsFrom, roomsTo) {
  const strict = [];
  const relaxed = [];
  for (let y = 0; y <= height - LINK_H; y++) {
    for (let x = 0; x <= width - LINK_W; x++) {
      if (!footprintFree(grid, width, height, fromFloor, x, y)) continue;
      if (!footprintFree(grid, width, height, toFloor, x, y)) continue;
      relaxed.push({ x, y });
      if (nearRoom(roomsFrom, x, y, PROXIMITY) && nearRoom(roomsTo, x, y, PROXIMITY)) {
        strict.push({ x, y });
      }
    }
  }
  return strict.length > 0 ? strict : relaxed;
}

function dispersionFilter(candidates, chosenFootprints, minDist) {
  if (chosenFootprints.length === 0) return candidates;
  const filtered = candidates.filter((c) =>
    chosenFootprints.every((f) => Math.hypot(c.x - f.x, c.y - f.y) >= minDist));
  return filtered.length > 0 ? filtered : candidates;
}

function pickDispersed(candidates, chosenFootprints, rng) {
  if (chosenFootprints.length === 0) return rng.pick(candidates);
  let best = candidates[0];
  let bestMinDist = -Infinity;
  for (const c of candidates) {
    let minDist = Infinity;
    for (const f of chosenFootprints) {
      minDist = Math.min(minDist, Math.hypot(c.x - f.x, c.y - f.y));
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      best = c;
    }
  }
  return best;
}

/**
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floors
 * @param {Map<number, import('../types.js').Room[]>} roomsByFloor
 * @param {number} verticalLinksPerGap
 * @param {import('../rng.js').Rng} rng
 * @returns {import('../types.js').VerticalLink[]}
 */
export function chooseVerticalLinks(grid, width, height, floors, roomsByFloor, verticalLinksPerGap, rng) {
  const minDist = Math.min(width, height) / 3;
  const links = [];
  const chosenFootprints = [];
  let nextId = 0;

  for (let fromFloor = 0; fromFloor < floors - 1; fromFloor++) {
    const toFloor = fromFloor + 1;
    const roomsFrom = roomsByFloor.get(fromFloor) ?? [];
    const roomsTo = roomsByFloor.get(toFloor) ?? [];

    for (let i = 0; i < verticalLinksPerGap; i++) {
      const candidates = collectCandidates(grid, width, height, fromFloor, toFloor, roomsFrom, roomsTo);
      if (candidates.length === 0) continue;

      const filtered = dispersionFilter(candidates, chosenFootprints, minDist);
      const footprint = pickDispersed(filtered, chosenFootprints, rng);
      chosenFootprints.push(footprint);

      for (const floor of [fromFloor, toFloor]) {
        for (let dy = 0; dy < LINK_H; dy++) {
          for (let dx = 0; dx < LINK_W; dx++) {
            setCell(grid, footprint.x + dx, footprint.y + dy, floor, width, height, CELL.STAIR);
          }
        }
      }

      links.push({
        id: nextId++,
        fromFloor,
        toFloor,
        x: footprint.x,
        y: footprint.y,
        w: LINK_W,
        h: LINK_H,
        kind: 'stair',
      });
    }
  }

  return links;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/stages/05-vertical-links.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/05-vertical-links.js packages/core/test/stages/05-vertical-links.test.js
git commit -m "feat(core): add stage 05 — chooseVerticalLinks"
```

---

### Task 2: `06-carve.js` — treat `CELL.STAIR` as passable, add `carveToPoint`

**Files:**
- Modify: `packages/core/src/stages/06-carve.js`
- Modify (add tests, don't replace existing ones): `packages/core/test/stages/06-carve.test.js`

**Interfaces:**
- Consumes: existing `CELL`, `getCell`, `setCell`, `inBounds` from `../grid.js`.
- Produces: `cellCost(cellValue, costs)` becomes a **named export** (previously private); new export `carveToPoint(grid, width, height, floor, room, point, costs)` where `room` is a `Room` and `point` is `{x, y}` in cell coordinates. `carve(...)`'s existing signature and behavior are unchanged. Task 5 (pipeline rewrite) uses `carveToPoint` to connect the nearest room on each floor to a chosen `VerticalLink` footprint.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `packages/core/test/stages/06-carve.test.js` (update the top import line to also pull in `cellCost` and `carveToPoint`):

```js
import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell, getCell, cellIndex } from '../../src/grid.js';
import { carve, cellCost, carveToPoint } from '../../src/stages/06-carve.js';
```

```js
describe('cellCost', () => {
  it('costs a STAIR cell the same as reusing an existing hallway', () => {
    expect(cellCost(CELL.STAIR, COSTS)).toBe(COSTS.reuseHallway);
  });
});

describe('carve — CELL.STAIR handling', () => {
  it('does not overwrite existing CELL.STAIR cells when carving through them', () => {
    const width = 10, height = 2;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 0, 0, 2, 2);
    const r1 = room(1, 8, 0, 2, 2);
    stampRoom(grid, r0, width, height);
    stampRoom(grid, r1, width, height);
    setCell(grid, 4, 1, 0, width, height, CELL.STAIR);
    setCell(grid, 5, 1, 0, width, height, CELL.STAIR);

    carve(grid, width, height, 0, [r0, r1], [{ a: 0, b: 1, weight: 1, kind: 'mst' }], COSTS);

    expect(getCell(grid, 4, 1, 0, width, height)).toBe(CELL.STAIR);
    expect(getCell(grid, 5, 1, 0, width, height)).toBe(CELL.STAIR);
  });
});

describe('carveToPoint', () => {
  it('carves a path from a room to an arbitrary point on the same floor', () => {
    const width = 20, height = 20;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 3, 3);
    stampRoom(grid, r0, width, height);
    carveToPoint(grid, width, height, 0, r0, { x: 15, y: 15 }, COSTS);
    expect(getCell(grid, 15, 15, 0, width, height)).not.toBe(CELL.EMPTY);
  });

  it('is deterministic', () => {
    const width = 20, height = 20;
    const gridA = createGrid(width, height, 1);
    const gridB = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 3, 3);
    stampRoom(gridA, r0, width, height);
    stampRoom(gridB, r0, width, height);
    carveToPoint(gridA, width, height, 0, r0, { x: 15, y: 15 }, COSTS);
    carveToPoint(gridB, width, height, 0, r0, { x: 15, y: 15 }, COSTS);
    expect(Array.from(gridA)).toEqual(Array.from(gridB));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/06-carve.test.js`
Expected: FAIL — `cellCost is not a function` / `carveToPoint is not a function` (not exported yet)

- [ ] **Step 3: Write the implementation**

Replace the full contents of `packages/core/src/stages/06-carve.js`:

```js
import { CELL, getCell, setCell, inBounds } from '../grid.js';

function roomBoundaryCell(room) {
  // A single accessible cell just outside the room's edge, used as the
  // A* target/source so the path connects to the room without cutting
  // through its interior needlessly.
  return { x: Math.round(room.cx), y: Math.round(room.cy) };
}

export function cellCost(cellValue, costs) {
  switch (cellValue) {
    case CELL.EMPTY:
      return costs.newHallway;
    case CELL.HALLWAY:
      return costs.reuseHallway;
    case CELL.STAIR:
      // A vertical-link footprint is walkable, same as an existing hallway
      // (SPEC.md §5.8, "Arestas verticais: o A* vai até a célula de acesso
      // do footprint do link, não atravessa" — reaching it must be cheap,
      // exactly like reusing a corridor).
      return costs.reuseHallway;
    case CELL.ROOM:
      return costs.throughRoom;
    default:
      return Infinity;
  }
}

function astar(grid, width, height, floor, start, goal, costs) {
  const key = (x, y) => `${x},${y}`;
  const open = new Map([[key(start.x, start.y), { x: start.x, y: start.y, dir: null }]]);
  const cameFrom = new Map();
  const gScore = new Map([[key(start.x, start.y), 0]]);
  const fScore = new Map([[key(start.x, start.y), Math.hypot(goal.x - start.x, goal.y - start.y)]]);

  const dirs = [
    { dx: 1, dy: 0, name: 'e' },
    { dx: -1, dy: 0, name: 'w' },
    { dx: 0, dy: 1, name: 's' },
    { dx: 0, dy: -1, name: 'n' },
  ];

  while (open.size > 0) {
    let currentKey = null;
    let currentF = Infinity;
    for (const [k, node] of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentKey = k;
      }
    }
    const current = open.get(currentKey);
    open.delete(currentKey);

    if (current.x === goal.x && current.y === goal.y) {
      const path = [current];
      let k = currentKey;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k);
        path.unshift(prev);
        k = key(prev.x, prev.y);
      }
      return path;
    }

    for (const d of dirs) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;
      if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;

      const cellValue = getCell(grid, nx, ny, floor, width, height);
      const stepCost = cellCost(cellValue, costs);
      if (!Number.isFinite(stepCost)) continue;

      const turnPenalty = current.dir && current.dir !== d.name ? costs.turn : 0;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost + turnPenalty;

      const nKey = key(nx, ny);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + Math.hypot(goal.x - nx, goal.y - ny));
        open.set(nKey, { x: nx, y: ny, dir: d.name });
      }
    }
  }

  return null; // unreachable — caller decides how to handle (should not happen post-M2 given MST connectivity)
}

function stampPath(grid, width, height, floor, path) {
  for (const node of path) {
    if (getCell(grid, node.x, node.y, floor, width, height) === CELL.EMPTY) {
      setCell(grid, node.x, node.y, floor, width, height, CELL.HALLWAY);
    }
  }
}

/**
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {import('../types.js').Room[]} rooms
 * @param {import('../types.js').Edge[]} edges
 * @param {import('../types.js').CarveCosts} costs
 */
export function carve(grid, width, height, floor, rooms, edges, costs) {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));

  const mst = edges.filter((e) => e.kind === 'mst');
  const cycles = edges.filter((e) => e.kind === 'cycle');

  for (const edge of [...mst, ...cycles]) {
    const roomA = roomsById.get(edge.a);
    const roomB = roomsById.get(edge.b);
    const start = roomBoundaryCell(roomA);
    const goal = roomBoundaryCell(roomB);

    const path = astar(grid, width, height, floor, start, goal, costs);
    if (!path) continue;

    stampPath(grid, width, height, floor, path);
  }
}

/**
 * Carves a path from a room to an arbitrary point on the same floor — used
 * to connect the nearest room to a chosen VerticalLink footprint (SPEC.md
 * §5.8, "Arestas verticais").
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {import('../types.js').Room} room
 * @param {{x:number,y:number}} point
 * @param {import('../types.js').CarveCosts} costs
 */
export function carveToPoint(grid, width, height, floor, room, point, costs) {
  const start = roomBoundaryCell(room);
  const goal = { x: Math.round(point.x), y: Math.round(point.y) };
  const path = astar(grid, width, height, floor, start, goal, costs);
  if (!path) return;
  stampPath(grid, width, height, floor, path);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/06-carve.test.js`
Expected: PASS (all existing tests plus the new ones)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/06-carve.js packages/core/test/stages/06-carve.test.js
git commit -m "feat(core): carve treats CELL.STAIR as passable, adds carveToPoint"
```

---

### Task 3: `06-carve.js` — corridor thickening from residual cells

**Files:**
- Modify: `packages/core/src/stages/06-carve.js`
- Modify: `packages/core/test/stages/06-carve.test.js`

**Interfaces:**
- Consumes: same grid helpers as Task 2.
- Produces: `thickenCorridors(grid, width, height, floor, residualCells)`, where `residualCells` is the `{x, y, w, h}[]` array `placeRooms` already returns (SPEC.md §5.3, step 6) — no upstream change needed, `01-place-rooms.js` already produces this. Task 5 (pipeline rewrite) calls this once per floor.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/stages/06-carve.test.js` (update the top import to add `thickenCorridors`):

```js
import { carve, cellCost, carveToPoint, thickenCorridors } from '../../src/stages/06-carve.js';
```

```js
describe('thickenCorridors', () => {
  it('converts a residual cell to HALLWAY when it touches a carved corridor', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 5, 5, 0, width, height, CELL.HALLWAY);
    const residualCells = [{ x: 4, y: 4, w: 3, h: 3 }];
    thickenCorridors(grid, width, height, 0, residualCells);
    expect(getCell(grid, 4, 4, 0, width, height)).toBe(CELL.HALLWAY);
    expect(getCell(grid, 6, 6, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('leaves a residual cell untouched when it does not touch a corridor', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    const residualCells = [{ x: 0, y: 0, w: 2, h: 2 }];
    thickenCorridors(grid, width, height, 0, residualCells);
    expect(getCell(grid, 0, 0, 0, width, height)).toBe(CELL.EMPTY);
  });

  it('never overwrites a ROOM cell', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 4, 4, 0, width, height, CELL.ROOM);
    setCell(grid, 5, 5, 0, width, height, CELL.HALLWAY);
    const residualCells = [{ x: 4, y: 4, w: 3, h: 3 }];
    thickenCorridors(grid, width, height, 0, residualCells);
    expect(getCell(grid, 4, 4, 0, width, height)).toBe(CELL.ROOM);
  });

  it('safely skips out-of-bounds residual cells instead of throwing', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 9, 9, 0, width, height, CELL.HALLWAY);
    const residualCells = [{ x: 8, y: 8, w: 5, h: 5 }];
    expect(() => thickenCorridors(grid, width, height, 0, residualCells)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/06-carve.test.js`
Expected: FAIL — `thickenCorridors is not a function`

- [ ] **Step 3: Write the implementation**

Add to `packages/core/src/stages/06-carve.js` (after `carveToPoint`):

```js
function rectTouchesHallway(grid, width, height, floor, cell) {
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      if (!inBounds(x, y, floor, width, height, floor + 1)) continue;
      if (getCell(grid, x, y, floor, width, height) === CELL.HALLWAY) return true;
    }
  }
  return false;
}

/**
 * Converts residual (unpromoted) room-placement cells into HALLWAY wherever
 * they touch a carved corridor, producing the irregular corridor widening
 * described in SPEC.md §5.8 ("Engrossamento de corredor"). residualCells are
 * not guaranteed to be in-bounds (see 01-place-rooms.js's doc comment); each
 * cell is bounds-checked individually rather than clamped up front.
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {{x:number,y:number,w:number,h:number}[]} residualCells
 */
export function thickenCorridors(grid, width, height, floor, residualCells) {
  for (const cell of residualCells) {
    if (!rectTouchesHallway(grid, width, height, floor, cell)) continue;
    for (let y = cell.y; y < cell.y + cell.h; y++) {
      for (let x = cell.x; x < cell.x + cell.w; x++) {
        if (!inBounds(x, y, floor, width, height, floor + 1)) continue;
        if (getCell(grid, x, y, floor, width, height) === CELL.EMPTY) {
          setCell(grid, x, y, floor, width, height, CELL.HALLWAY);
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/06-carve.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/06-carve.js packages/core/test/stages/06-carve.test.js
git commit -m "feat(core): add thickenCorridors (stage 6 corridor engrossamento)"
```

---

### Task 4: `07-prune.js` — dead-end removal

**Files:**
- Create: `packages/core/src/stages/07-prune.js`
- Test: `packages/core/test/stages/07-prune.test.js`

**Interfaces:**
- Consumes: `CELL`, `getCell`, `setCell`, `inBounds` from `../grid.js`.
- Produces: `prune(grid, width, height, floor, iterations)` — mutates `grid` in place, no return value. Task 5 (pipeline rewrite) calls this once per floor, after `thickenCorridors`.

- [ ] **Step 1: Write the failing test**

```js
// packages/core/test/stages/07-prune.test.js
import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell, getCell } from '../../src/grid.js';
import { prune } from '../../src/stages/07-prune.js';

describe('prune', () => {
  it('removes a dead-end HALLWAY stub but preserves the through-corridor it branches from', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 1, 5, 0, width, height, CELL.ROOM);
    setCell(grid, 8, 5, 0, width, height, CELL.ROOM);
    for (let x = 2; x <= 7; x++) setCell(grid, x, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 5, 4, 0, width, height, CELL.HALLWAY);
    setCell(grid, 5, 3, 0, width, height, CELL.HALLWAY);

    prune(grid, width, height, 0, 8);

    expect(getCell(grid, 5, 3, 0, width, height)).toBe(CELL.EMPTY);
    expect(getCell(grid, 5, 4, 0, width, height)).toBe(CELL.EMPTY);
    for (let x = 2; x <= 7; x++) {
      expect(getCell(grid, x, 5, 0, width, height)).toBe(CELL.HALLWAY);
    }
  });

  it('preserves a HALLWAY cell adjacent to a ROOM even with only one walkable neighbor', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 5, 5, 0, width, height, CELL.ROOM);
    setCell(grid, 5, 4, 0, width, height, CELL.HALLWAY);
    prune(grid, width, height, 0, 8);
    expect(getCell(grid, 5, 4, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('preserves a HALLWAY cell adjacent to a STAIR', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 5, 5, 0, width, height, CELL.STAIR);
    setCell(grid, 5, 4, 0, width, height, CELL.HALLWAY);
    prune(grid, width, height, 0, 8);
    expect(getCell(grid, 5, 4, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('does not touch a HALLWAY cell with 2 walkable neighbors (mid-corridor)', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 1, 5, 0, width, height, CELL.ROOM);
    setCell(grid, 5, 5, 0, width, height, CELL.ROOM);
    for (let x = 2; x <= 4; x++) setCell(grid, x, 5, 0, width, height, CELL.HALLWAY);
    prune(grid, width, height, 0, 8);
    expect(getCell(grid, 3, 5, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('evaluates each iteration from a stable snapshot, not cascading within the same pass', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 3, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 4, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 5, 5, 0, width, height, CELL.HALLWAY);
    prune(grid, width, height, 0, 1);
    // Both original degree-1 ends are pruned in this single pass (evaluated
    // against the pre-pass grid), leaving the now-isolated middle cell —
    // SPEC.md's rule only fires on cells that were degree-1 *before* the pass.
    expect(getCell(grid, 3, 5, 0, width, height)).toBe(CELL.EMPTY);
    expect(getCell(grid, 5, 5, 0, width, height)).toBe(CELL.EMPTY);
    expect(getCell(grid, 4, 5, 0, width, height)).toBe(CELL.HALLWAY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/stages/07-prune.test.js`
Expected: FAIL — `Cannot find module '../../src/stages/07-prune.js'`

- [ ] **Step 3: Write the implementation**

```js
// packages/core/src/stages/07-prune.js
import { CELL, getCell, setCell, inBounds } from '../grid.js';

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function isWalkable(v) {
  return v === CELL.ROOM || v === CELL.HALLWAY || v === CELL.STAIR;
}

function walkableNeighborCount(grid, width, height, floor, x, y) {
  let count = 0;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
    if (isWalkable(getCell(grid, nx, ny, floor, width, height))) count++;
  }
  return count;
}

function touchesRoomOrStair(grid, width, height, floor, x, y) {
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
    const v = getCell(grid, nx, ny, floor, width, height);
    if (v === CELL.ROOM || v === CELL.STAIR) return true;
  }
  return false;
}

/**
 * Iterative dead-end removal (SPEC.md §5.9). Each iteration is evaluated
 * against a snapshot taken at the start of that iteration — cells cleared
 * mid-pass don't retroactively change what else clears in the same pass —
 * so results don't depend on scan order.
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {number} iterations
 */
export function prune(grid, width, height, floor, iterations) {
  for (let iter = 0; iter < iterations; iter++) {
    const toClear = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (getCell(grid, x, y, floor, width, height) !== CELL.HALLWAY) continue;
        if (walkableNeighborCount(grid, width, height, floor, x, y) !== 1) continue;
        if (touchesRoomOrStair(grid, width, height, floor, x, y)) continue;
        toClear.push([x, y]);
      }
    }
    if (toClear.length === 0) break;
    for (const [x, y] of toClear) {
      setCell(grid, x, y, floor, width, height, CELL.EMPTY);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/stages/07-prune.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/07-prune.js packages/core/test/stages/07-prune.test.js
git commit -m "feat(core): add stage 07 — prune dead-end hallways"
```

---

### Task 5: `pipeline.js` — wire multi-floor generation end-to-end

**Files:**
- Modify: `packages/core/src/pipeline.js`
- Modify: `packages/core/test/pipeline.test.js`

**Interfaces:**
- Consumes: `chooseVerticalLinks` (Task 1), `carve`/`carveToPoint`/`thickenCorridors` (Tasks 2–3), `prune` (Task 4), plus the pre-existing `placeRooms`, `triangulate`, `spanningTree`, `addCycles`, `mission`, `buildKey`, `extractWalls`.
- Produces: `generateDungeon(config)` now supports `config.floors >= 1` (previously threw for anything but `1`). Returned `Dungeon.rooms` have globally unique `id`s across floors; `Dungeon.links` is populated; `Dungeon.doors[].id` are globally unique across floors. This is the last core-pipeline task other tasks depend on (`validate.js` in Task 6 runs against its output).

- [ ] **Step 1: Write the failing tests**

Replace `packages/core/test/pipeline.test.js` in full:

```js
// packages/core/test/pipeline.test.js
import { describe, it, expect } from 'vitest';
import { generateDungeon } from '../src/pipeline.js';
import { CELL } from '../src/grid.js';

const CONFIG = {
  seed: 'plan-m0-m3',
  floors: 1,
  width: 50,
  height: 50,
  rooms: { count: 9, sizeMean: 7, sizeStdDev: 2.5, sizeMin: 3, sizeMax: 14, spawnRadius: 18, separationIters: 60 },
  cycleRate: 0.25,
  verticalLinksPerGap: 2,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

const MULTI_FLOOR_CONFIG = {
  ...CONFIG,
  seed: 'plan-m5-multi-floor',
  floors: 3,
  width: 40,
  height: 40,
  rooms: { ...CONFIG.rooms, count: 6, spawnRadius: 14 },
};

function isWalkable(v) {
  return v === CELL.ROOM || v === CELL.HALLWAY || v === CELL.STAIR;
}

function floodFillWalkable(cells, width, height, floors) {
  const size = width * height;
  const start = cells.findIndex(isWalkable);
  const seen = new Uint8Array(cells.length);
  seen[start] = 1;
  const stack = [start];
  while (stack.length) {
    const idx = stack.pop();
    const z = Math.floor(idx / size);
    const rem = idx % size;
    const y = Math.floor(rem / width);
    const x = rem % width;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || nz < 0 || nz >= floors) continue;
      const nIdx = nz * size + ny * width + nx;
      if (!seen[nIdx] && isWalkable(cells[nIdx])) {
        seen[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }
  return seen;
}

describe('generateDungeon', () => {
  it('produces a Dungeon with rooms, walls, areas, and a markdown-able key', () => {
    const dungeon = generateDungeon(CONFIG);
    expect(dungeon.rooms.length).toBe(CONFIG.rooms.count);
    expect(dungeon.walls.length).toBeGreaterThan(0);
    expect(dungeon.areas.length).toBe(CONFIG.rooms.count);
    expect(dungeon.key.entries.length).toBe(CONFIG.rooms.count);
    expect(typeof dungeon.mission.entranceRoomId).toBe('number');
  });

  it('is bit-for-bit deterministic across two runs with the same seed', () => {
    const a = generateDungeon(CONFIG);
    const b = generateDungeon(CONFIG);
    const serialize = (d) => JSON.stringify({ ...d, cells: Array.from(d.cells) });
    expect(serialize(a)).toEqual(serialize(b));
  });

  it('every room is reachable from every other room (single connected floor)', () => {
    const dungeon = generateDungeon(CONFIG);
    const seen = floodFillWalkable(dungeon.cells, dungeon.width, dungeon.height, dungeon.floors);
    const totalWalkable = Array.from(dungeon.cells).filter(isWalkable).length;
    const reached = Array.from(seen).filter((v) => v === 1).length;
    expect(reached).toBe(totalWalkable);
  });

  it('keyToMarkdown-compatible output round-trips through JSON', () => {
    const dungeon = generateDungeon(CONFIG);
    const roundTripped = JSON.parse(JSON.stringify({ ...dungeon, cells: Array.from(dungeon.cells) }));
    expect(roundTripped.areas.length).toBe(dungeon.areas.length);
  });

  it('assigns globally unique room ids across floors', () => {
    const dungeon = generateDungeon(MULTI_FLOOR_CONFIG);
    const ids = dungeon.rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(dungeon.rooms.length).toBe(MULTI_FLOOR_CONFIG.rooms.count * MULTI_FLOOR_CONFIG.floors);
  });

  it('produces verticalLinksPerGap VerticalLinks for every floor gap', () => {
    const dungeon = generateDungeon(MULTI_FLOOR_CONFIG);
    expect(dungeon.links.length).toBe((MULTI_FLOOR_CONFIG.floors - 1) * MULTI_FLOOR_CONFIG.verticalLinksPerGap);
    for (let f = 0; f < MULTI_FLOOR_CONFIG.floors - 1; f++) {
      expect(dungeon.links.some((l) => l.fromFloor === f && l.toFloor === f + 1)).toBe(true);
    }
  });

  it('every floor is walkable-connected to every other floor via VerticalLinks', () => {
    const dungeon = generateDungeon(MULTI_FLOOR_CONFIG);
    const seen = floodFillWalkable(dungeon.cells, dungeon.width, dungeon.height, dungeon.floors);
    const totalWalkable = Array.from(dungeon.cells).filter(isWalkable).length;
    const reached = Array.from(seen).filter((v) => v === 1).length;
    expect(reached).toBe(totalWalkable);
  });

  it('is bit-for-bit deterministic across two runs with the same seed, multi-floor', () => {
    const a = generateDungeon(MULTI_FLOOR_CONFIG);
    const b = generateDungeon(MULTI_FLOOR_CONFIG);
    const serialize = (d) => JSON.stringify({ ...d, cells: Array.from(d.cells) });
    expect(serialize(a)).toEqual(serialize(b));
  });

  it('every door id is unique across floors', () => {
    const dungeon = generateDungeon(MULTI_FLOOR_CONFIG);
    const ids = dungeon.doors.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests to verify the multi-floor ones fail**

Run: `npx vitest run packages/core/test/pipeline.test.js`
Expected: FAIL — `generateDungeon: floors=3 is not supported yet` (the current hard-coded guard)

- [ ] **Step 3: Write the implementation**

Replace `packages/core/src/pipeline.js` in full:

```js
// packages/core/src/pipeline.js
import { deriveRng } from './rng.js';
import { CELL, createGrid, setCell } from './grid.js';
import { placeRooms } from './stages/01-place-rooms.js';
import { triangulate } from './stages/02-triangulate.js';
import { spanningTree } from './stages/03-spanning-tree.js';
import { addCycles } from './stages/04-add-cycles.js';
import { chooseVerticalLinks } from './stages/05-vertical-links.js';
import { carve, carveToPoint, thickenCorridors } from './stages/06-carve.js';
import { prune } from './stages/07-prune.js';
import { mission } from './stages/08-mission.js';
import { buildKey, keyToMarkdown } from './stages/09-key.js';
import { extractWalls } from './stages/10-extract-walls.js';

function clampRoomToGrid(room, width, height) {
  // Defensive clamp: steering separation in placeRooms can still push a
  // room's centroid beyond the initial spawn disk in some seeds, landing it
  // partially or fully outside the grid. This can rarely nudge a clamped
  // room into overlapping an in-bounds neighbor — harmless at this scope.
  room.x = Math.max(0, Math.min(room.x, width - room.w));
  room.y = Math.max(0, Math.min(room.y, height - room.h));
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
}

function stampRoom(grid, room, floor, width, height) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      setCell(grid, x, y, floor, width, height, CELL.ROOM);
    }
  }
}

function nearestRoom(rooms, x, y) {
  let best = rooms[0];
  let bestDist = Infinity;
  for (const r of rooms) {
    const d = Math.hypot(r.cx - x, r.cy - y);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}

function linkFootprintCenter(link) {
  return { x: link.x + (link.w - 1) / 2, y: link.y + (link.h - 1) / 2 };
}

/** @param {import('./types.js').Config} config */
export function generateDungeon(config) {
  const { width, height, floors } = config;
  const grid = createGrid(width, height, floors);

  const roomsByFloor = new Map();
  const residualByFloor = new Map();
  const edgesByFloor = new Map();
  let nextRoomId = 0;

  for (let floor = 0; floor < floors; floor++) {
    const { rooms, residualCells } = placeRooms(
      config.rooms, floor, deriveRng(`${config.seed}:${floor}`, 'place-rooms'),
    );

    for (const room of rooms) {
      clampRoomToGrid(room, width, height);
      room.id = nextRoomId++;
    }
    for (const room of rooms) stampRoom(grid, room, floor, width, height);

    roomsByFloor.set(floor, rooms);
    residualByFloor.set(floor, residualCells);

    const floorAllEdges = triangulate(rooms);
    const mstEdges = spanningTree(rooms, floorAllEdges);
    const edges = addCycles(
      floorAllEdges, mstEdges, config.cycleRate, deriveRng(`${config.seed}:${floor}`, 'add-cycles'),
    );
    edgesByFloor.set(floor, edges);
  }

  const links = chooseVerticalLinks(
    grid, width, height, floors, roomsByFloor, config.verticalLinksPerGap,
    deriveRng(config.seed, 'vertical-links'),
  );

  for (let floor = 0; floor < floors; floor++) {
    carve(grid, width, height, floor, roomsByFloor.get(floor), edgesByFloor.get(floor), config.carve);
  }

  const verticalEdges = [];
  for (const link of links) {
    const center = linkFootprintCenter(link);
    const fromRoom = nearestRoom(roomsByFloor.get(link.fromFloor), center.x, center.y);
    const toRoom = nearestRoom(roomsByFloor.get(link.toFloor), center.x, center.y);
    carveToPoint(grid, width, height, link.fromFloor, fromRoom, center, config.carve);
    carveToPoint(grid, width, height, link.toFloor, toRoom, center, config.carve);
    const weight = Math.hypot(fromRoom.cx - center.x, fromRoom.cy - center.y)
      + Math.hypot(toRoom.cx - center.x, toRoom.cy - center.y);
    verticalEdges.push({ a: fromRoom.id, b: toRoom.id, weight, kind: 'vertical' });
  }

  for (let floor = 0; floor < floors; floor++) {
    thickenCorridors(grid, width, height, floor, residualByFloor.get(floor));
    prune(grid, width, height, floor, config.pruneIterations);
  }

  const allRooms = [...roomsByFloor.values()].flat();
  const allEdges = [...edgesByFloor.values()].flat().concat(verticalEdges);

  const missionResult = mission(allRooms, allEdges);

  let walls = [];
  let doors = [];
  let doorIdOffset = 0;
  for (let floor = 0; floor < floors; floor++) {
    const rooms = roomsByFloor.get(floor);
    const result = extractWalls(grid, width, height, floor, rooms);

    for (const wall of result.walls) {
      if (wall.isDoor) wall.doorId += doorIdOffset;
    }
    for (const door of result.doors) {
      door.id += doorIdOffset;
    }
    for (const room of rooms) {
      room.doors = room.doors.map((id) => id + doorIdOffset);
    }

    walls = walls.concat(result.walls);
    doors = doors.concat(result.doors);
    doorIdOffset += result.doors.length;
  }

  const roomAdjacency = allEdges
    .filter((e) => e.kind !== 'vertical')
    .map((e) => ({ a: e.a, b: e.b }));
  const { areas, key } = buildKey(allRooms, roomAdjacency, missionResult.entranceRoomId, config.key);

  return {
    config,
    seed: config.seed,
    width,
    height,
    floors,
    cells: grid,
    rooms: allRooms,
    edges: allEdges,
    links,
    doors,
    walls,
    mission: missionResult,
    areas,
    key,
  };
}

export { keyToMarkdown };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/pipeline.test.js`
Expected: PASS (9 tests)

Then run the full core suite to make sure nothing upstream regressed:

Run: `npx vitest run packages/core`
Expected: PASS (all files)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pipeline.js packages/core/test/pipeline.test.js
git commit -m "feat(core): wire multi-floor generation end-to-end (vertical links, thickening, prune)"
```

---

### Task 6: `validate.js` — SPEC.md §6 invariants

**Files:**
- Create: `packages/core/src/validate.js`
- Test: `packages/core/test/validate.test.js`

**Interfaces:**
- Consumes: `CELL` from `./grid.js`; a full `Dungeon` object (as returned by `generateDungeon`).
- Produces: `validateDungeon(dungeon) → { ok: boolean, errors: {code: string, message: string}[] }`. Task 7 (property test) calls this directly.
- **Not implemented** (documented in code, not silently skipped): invariant 15 ("vínculo íntegro" — Note↔JournalEntry page linkage) is Foundry/adapter-specific and has no meaning against the core-only `Dungeon` shape; it belongs with `adapter-foundry` when that lands.
- **Scoping note on invariants 7 and 14** (wall/note budgets): SPEC.md §6 describes these as "total in v14, per-floor in v13", keyed off `config.target` — a field that doesn't exist on `Config` yet (see Global Constraints). Until `adapter-foundry` introduces `config.target`, this implementation checks the stricter **per-floor** budget unconditionally.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/validate.test.js
import { describe, it, expect } from 'vitest';
import { validateDungeon } from '../src/validate.js';
import { generateDungeon } from '../src/pipeline.js';
import { CELL } from '../src/grid.js';

const CONFIG = {
  seed: 'validate-happy-path',
  floors: 1,
  width: 50,
  height: 50,
  rooms: { count: 9, sizeMean: 7, sizeStdDev: 2.5, sizeMin: 3, sizeMax: 14, spawnRadius: 18, separationIters: 60 },
  cycleRate: 0.25,
  verticalLinksPerGap: 2,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

const MULTI_FLOOR_CONFIG = {
  ...CONFIG,
  seed: 'validate-multi-floor',
  floors: 3,
  width: 40,
  height: 40,
  rooms: { ...CONFIG.rooms, count: 6, spawnRadius: 14 },
};

describe('validateDungeon', () => {
  it('reports ok for a normally generated single-floor dungeon', () => {
    const result = validateDungeon(generateDungeon(CONFIG));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('reports ok for a normally generated multi-floor dungeon', () => {
    const result = validateDungeon(generateDungeon(MULTI_FLOOR_CONFIG));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('flags a VerticalLink whose footprint is not actually CELL.STAIR', () => {
    const dungeon = generateDungeon(MULTI_FLOOR_CONFIG);
    const size = dungeon.width * dungeon.height;
    const link = dungeon.links[0];
    const idx = link.fromFloor * size + link.y * dungeon.width + link.x;
    const brokenCells = dungeon.cells.slice();
    brokenCells[idx] = CELL.EMPTY;
    const result = validateDungeon({ ...dungeon, cells: brokenCells });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'stairs-paired')).toBe(true);
  });

  it('flags an Area whose exit has no reciprocal exit', () => {
    const dungeon = generateDungeon(CONFIG);
    const broken = {
      ...dungeon,
      areas: dungeon.areas.map((a, i) => (
        i === 0 ? { ...a, exits: [...a.exits, { dir: 'n', toLabel: 'nonexistent-label', via: 'door' }] } : a
      )),
    };
    const result = validateDungeon(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'exits-symmetric')).toBe(true);
  });

  it('flags a Room with zero doors', () => {
    const dungeon = generateDungeon(CONFIG);
    const broken = {
      ...dungeon,
      rooms: dungeon.rooms.map((r, i) => (i === 0 ? { ...r, doors: [] } : r)),
    };
    const result = validateDungeon(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'room-has-door')).toBe(true);
  });

  it('flags a Room missing its Area (key incomplete)', () => {
    const dungeon = generateDungeon(CONFIG);
    const broken = { ...dungeon, areas: dungeon.areas.slice(1) };
    const result = validateDungeon(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'key-complete')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/validate.test.js`
Expected: FAIL — `Cannot find module '../src/validate.js'`

- [ ] **Step 3: Write the implementation**

```js
// packages/core/src/validate.js
import { CELL } from './grid.js';

function isWalkableCell(v) {
  return v === CELL.ROOM || v === CELL.HALLWAY || v === CELL.STAIR;
}

function safeCellAt(cells, width, height, floor, x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return CELL.EMPTY;
  return cells[floor * (width * height) + y * width + x];
}

function pushIssue(errors, code, message) {
  errors.push({ code, message });
}

// --- 1. Conectividade por andar ---
function checkFloorConnectivity(dungeon, errors) {
  const { cells, width, height, floors } = dungeon;
  const size = width * height;
  for (let floor = 0; floor < floors; floor++) {
    const base = floor * size;
    let start = -1;
    for (let i = 0; i < size; i++) {
      if (isWalkableCell(cells[base + i])) { start = i; break; }
    }
    if (start === -1) continue; // no walkable cells on this floor — nothing to check

    const seen = new Uint8Array(size);
    seen[start] = 1;
    const stack = [start];
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width;
      const y = Math.floor(idx / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!seen[nIdx] && isWalkableCell(cells[base + nIdx])) {
          seen[nIdx] = 1;
          stack.push(nIdx);
        }
      }
    }

    let totalWalkable = 0;
    let reached = 0;
    for (let i = 0; i < size; i++) {
      if (isWalkableCell(cells[base + i])) {
        totalWalkable++;
        if (seen[i]) reached++;
      }
    }
    if (reached !== totalWalkable) {
      pushIssue(errors, 'floor-connectivity',
        `floor ${floor}: ${totalWalkable - reached} walkable cell(s) unreachable from the rest of the floor`);
    }
  }
}

// --- 2. Conectividade global (atravessando VerticalLinks) ---
function buildVerticalTransitions(links) {
  const transitions = new Map();
  const add = (x, y, floor, targetFloor) => {
    const key = `${x},${y},${floor}`;
    if (!transitions.has(key)) transitions.set(key, new Set());
    transitions.get(key).add(targetFloor);
  };
  for (const link of links) {
    for (let dy = 0; dy < link.h; dy++) {
      for (let dx = 0; dx < link.w; dx++) {
        const x = link.x + dx;
        const y = link.y + dy;
        add(x, y, link.fromFloor, link.toFloor);
        add(x, y, link.toFloor, link.fromFloor);
      }
    }
  }
  return transitions;
}

function checkGlobalConnectivity(dungeon, errors) {
  const { cells, width, height, floors, links } = dungeon;
  const size = width * height;
  const idx3 = (x, y, z) => z * size + y * width + x;
  const transitions = buildVerticalTransitions(links);

  const startIdx = cells.findIndex(isWalkableCell);
  if (startIdx === -1) {
    pushIssue(errors, 'global-connectivity', 'no walkable cell exists anywhere in the dungeon');
    return;
  }

  const seen = new Uint8Array(cells.length);
  seen[startIdx] = 1;
  const stack = [startIdx];
  while (stack.length) {
    const idx = stack.pop();
    const z = Math.floor(idx / size);
    const rem = idx % size;
    const y = Math.floor(rem / width);
    const x = rem % width;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = idx3(nx, ny, z);
      if (!seen[nIdx] && isWalkableCell(cells[nIdx])) {
        seen[nIdx] = 1;
        stack.push(nIdx);
      }
    }

    const targets = transitions.get(`${x},${y},${z}`);
    if (targets) {
      for (const targetFloor of targets) {
        const nIdx = idx3(x, y, targetFloor);
        if (!seen[nIdx] && isWalkableCell(cells[nIdx])) {
          seen[nIdx] = 1;
          stack.push(nIdx);
        }
      }
    }
  }

  const totalWalkable = Array.from(cells).filter(isWalkableCell).length;
  const reached = Array.from(seen).filter((v) => v === 1).length;
  if (reached !== totalWalkable) {
    pushIssue(errors, 'global-connectivity',
      `${totalWalkable - reached} walkable cell(s) unreachable across floors via VerticalLinks`);
  }
}

// --- 3. Escadas pareadas ---
function checkStairsPaired(dungeon, errors) {
  const { cells, width, height, links } = dungeon;
  const size = width * height;
  for (const link of links) {
    for (const floor of [link.fromFloor, link.toFloor]) {
      for (let dy = 0; dy < link.h; dy++) {
        for (let dx = 0; dx < link.w; dx++) {
          const x = link.x + dx;
          const y = link.y + dy;
          const idx = floor * size + y * width + x;
          if (cells[idx] !== CELL.STAIR) {
            pushIssue(errors, 'stairs-paired',
              `VerticalLink ${link.id}: footprint cell (${x},${y}) on floor ${floor} is not CELL.STAIR`);
          }
        }
      }
    }
  }
}

// --- 4. Portas bem formadas ---
function checkDoorsWellFormed(dungeon, errors) {
  const { cells, width, height, doors } = dungeon;
  for (const door of doors) {
    const horizontal = door.y1 === door.y2;
    if (horizontal) {
      for (let x = door.x1; x < door.x2; x++) {
        const above = safeCellAt(cells, width, height, door.floor, x, door.y1 - 1);
        const below = safeCellAt(cells, width, height, door.floor, x, door.y1);
        if (!isWalkableCell(above) || !isWalkableCell(below)) {
          pushIssue(errors, 'door-well-formed',
            `Door ${door.id}: cell (${x},${door.y1}) on floor ${door.floor} lacks walkable cells on both sides`);
        }
      }
    } else {
      for (let y = door.y1; y < door.y2; y++) {
        const left = safeCellAt(cells, width, height, door.floor, door.x1 - 1, y);
        const right = safeCellAt(cells, width, height, door.floor, door.x1, y);
        if (!isWalkableCell(left) || !isWalkableCell(right)) {
          pushIssue(errors, 'door-well-formed',
            `Door ${door.id}: cell (${door.x1},${y}) on floor ${door.floor} lacks walkable cells on both sides`);
        }
      }
    }
  }
}

// --- 5. Sem parede órfã ---
function checkNoOrphanWalls(dungeon, errors) {
  const { cells, width, height, walls } = dungeon;
  for (const wall of walls) {
    const horizontal = wall.y1 === wall.y2;
    let touchesWalkable = false;
    if (horizontal) {
      for (let x = wall.x1; x < wall.x2 && !touchesWalkable; x++) {
        const above = safeCellAt(cells, width, height, wall.floor, x, wall.y1 - 1);
        const below = safeCellAt(cells, width, height, wall.floor, x, wall.y1);
        if (isWalkableCell(above) || isWalkableCell(below)) touchesWalkable = true;
      }
    } else {
      for (let y = wall.y1; y < wall.y2 && !touchesWalkable; y++) {
        const left = safeCellAt(cells, width, height, wall.floor, wall.x1 - 1, y);
        const right = safeCellAt(cells, width, height, wall.floor, wall.x1, y);
        if (isWalkableCell(left) || isWalkableCell(right)) touchesWalkable = true;
      }
    }
    if (!touchesWalkable) {
      pushIssue(errors, 'no-orphan-walls',
        `WallSegment on floor ${wall.floor} at (${wall.x1},${wall.y1})-(${wall.x2},${wall.y2}) borders no walkable cell`);
    }
  }
}

// --- 6. Sem beco sem conteúdo ---
function checkNoContentlessDeadEnds(dungeon, errors) {
  const { rooms, edges } = dungeon;
  const degree = new Map(rooms.map((r) => [r.id, 0]));
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  for (const room of rooms) {
    if (degree.get(room.id) === 1 && room.role === 'filler') {
      pushIssue(errors, 'contentless-dead-end',
        `Room ${room.id}: leaf room with role 'filler' has no narrative content`);
    }
  }
}

// --- 7. Orçamento de paredes (per-floor — see file header note) ---
function checkWallBudget(dungeon, errors) {
  const { walls, floors } = dungeon;
  const perFloor = new Map();
  for (const w of walls) perFloor.set(w.floor, (perFloor.get(w.floor) ?? 0) + 1);
  for (let floor = 0; floor < floors; floor++) {
    const count = perFloor.get(floor) ?? 0;
    if (count >= 1500) {
      pushIssue(errors, 'wall-budget', `floor ${floor}: ${count} wall segments exceeds the 1500 budget (SPEC.md §6.7)`);
    }
  }
}

// --- 8. Salas alcançáveis ---
function checkRoomsHaveDoors(dungeon, errors) {
  for (const room of dungeon.rooms) {
    if (room.doors.length === 0) {
      pushIssue(errors, 'room-has-door', `Room ${room.id} has zero doors`);
    }
  }
}

// --- 9. Chave completa ---
function checkKeyComplete(dungeon, errors) {
  const { rooms, areas, key } = dungeon;
  const areaByRoomId = new Map(areas.map((a) => [a.roomId, a]));
  for (const room of rooms) {
    if (!areaByRoomId.has(room.id)) {
      pushIssue(errors, 'key-complete', `Room ${room.id} has no Area`);
    }
  }
  const entryAreaIds = new Set(key.entries.map((e) => e.areaId));
  for (const area of areas) {
    if (!entryAreaIds.has(area.id)) {
      pushIssue(errors, 'key-complete', `Area ${area.id} (${area.label}) has no KeyEntry`);
    }
  }
}

// --- 10. Rótulos únicos e contíguos ---
function checkLabelsUniqueAndContiguous(dungeon, errors) {
  const { areas } = dungeon;
  const labels = areas.map((a) => a.label);
  if (new Set(labels).size !== labels.length) {
    pushIssue(errors, 'labels-unique', 'duplicate Area labels found');
  }

  const byFloor = new Map();
  for (const area of areas) {
    if (!byFloor.has(area.floor)) byFloor.set(area.floor, []);
    byFloor.get(area.floor).push(area.label);
  }
  for (const [floor, floorLabels] of byFloor) {
    const numbers = floorLabels
      .map((label) => label.match(/(\d+)$/))
      .filter(Boolean)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    if (numbers.length !== floorLabels.length) continue; // scheme without trailing digits — not expected for flat/per-floor/alpha-floor
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] !== numbers[i - 1] + 1) {
        pushIssue(errors, 'labels-contiguous',
          `floor ${floor}: area numbering has a gap between ${numbers[i - 1]} and ${numbers[i]}`);
      }
    }
  }
}

// --- 11. Saídas simétricas ---
function checkExitsSymmetric(dungeon, errors) {
  const { areas } = dungeon;
  const areaByLabel = new Map(areas.map((a) => [a.label, a]));
  for (const area of areas) {
    for (const exit of area.exits) {
      if (exit.via !== 'door') continue; // stairs/secret aren't modeled symmetrically by this stage yet
      const target = areaByLabel.get(exit.toLabel);
      if (!target) {
        pushIssue(errors, 'exits-symmetric', `Area ${area.label}: exit points to unknown label '${exit.toLabel}'`);
        continue;
      }
      const hasReciprocal = target.exits.some((e) => e.toLabel === area.label);
      if (!hasReciprocal) {
        pushIssue(errors, 'exits-symmetric', `Area ${area.label} → ${exit.toLabel} has no reciprocal exit`);
      }
    }
  }
}

// --- 12. Âncoras válidas ---
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function checkAnchorsValid(dungeon, errors) {
  const { areas, walls, cells, width, height } = dungeon;
  const MIN_WALL_DISTANCE = 0.4; // in cell units — see file header note on gridSize scaling

  const wallsByFloor = new Map();
  for (const w of walls) {
    if (!wallsByFloor.has(w.floor)) wallsByFloor.set(w.floor, []);
    wallsByFloor.get(w.floor).push(w);
  }

  for (const area of areas) {
    const cellValue = safeCellAt(cells, width, height, area.floor, Math.floor(area.cx), Math.floor(area.cy));
    if (!isWalkableCell(cellValue)) {
      pushIssue(errors, 'anchor-valid', `Area ${area.label}: anchor (${area.cx},${area.cy}) is not inside a walkable cell`);
      continue;
    }
    const floorWalls = wallsByFloor.get(area.floor) ?? [];
    let minDist = Infinity;
    for (const w of floorWalls) {
      minDist = Math.min(minDist, pointToSegmentDistance(area.cx, area.cy, w.x1, w.y1, w.x2, w.y2));
    }
    if (minDist < MIN_WALL_DISTANCE) {
      pushIssue(errors, 'anchor-valid',
        `Area ${area.label}: anchor is ${minDist.toFixed(2)} cells from a wall, below the ${MIN_WALL_DISTANCE} minimum`);
    }
  }
}

// --- 13. Legenda fiel ---
const LEGEND_KIND_BY_ROLE = { entrance: 'entrance', climax: 'climax', treasure: 'treasure', junction: 'junction' };

function checkLegendFaithful(dungeon, errors) {
  const { key, rooms } = dungeon;
  const legendKinds = new Set(key.legend.map((s) => s.kind));
  for (const room of rooms) {
    const expectedKind = LEGEND_KIND_BY_ROLE[room.role] ?? 'area';
    if (!legendKinds.has(expectedKind)) {
      pushIssue(errors, 'legend-faithful', `Room ${room.id} has role '${room.role}' but the legend has no '${expectedKind}' entry`);
    }
  }
  const rolesPresent = new Set(rooms.map((r) => LEGEND_KIND_BY_ROLE[r.role] ?? 'area'));
  for (const symbol of key.legend) {
    if (!rolesPresent.has(symbol.kind)) {
      pushIssue(errors, 'legend-faithful', `Legend declares '${symbol.kind}' but no Area uses it`);
    }
  }
}

// --- 14. Orçamento de Notes (per-floor — see file header note) ---
function checkNoteBudget(dungeon, errors) {
  const { areas, links, floors } = dungeon;
  for (let floor = 0; floor < floors; floor++) {
    const areaCount = areas.filter((a) => a.floor === floor).length;
    const linkCount = links.filter((l) => l.fromFloor === floor || l.toFloor === floor).length;
    const total = areaCount + linkCount * 2;
    if (total > 60) {
      pushIssue(errors, 'note-budget', `floor ${floor}: ${total} notes (areas + links*2) exceeds the 60 budget (SPEC.md §6.14)`);
    }
  }
}

/**
 * Runs SPEC.md §6's invariants against a Dungeon. Invariant 15 ("vínculo
 * íntegro") is not checked here — it concerns Note↔JournalEntry linkage,
 * which only exists once adapter-foundry emits Foundry documents.
 * @param {import('./types.js').Dungeon} dungeon
 * @returns {{ok: boolean, errors: {code: string, message: string}[]}}
 */
export function validateDungeon(dungeon) {
  const errors = [];
  checkFloorConnectivity(dungeon, errors);
  checkGlobalConnectivity(dungeon, errors);
  checkStairsPaired(dungeon, errors);
  checkDoorsWellFormed(dungeon, errors);
  checkNoOrphanWalls(dungeon, errors);
  checkNoContentlessDeadEnds(dungeon, errors);
  checkWallBudget(dungeon, errors);
  checkRoomsHaveDoors(dungeon, errors);
  checkKeyComplete(dungeon, errors);
  checkLabelsUniqueAndContiguous(dungeon, errors);
  checkExitsSymmetric(dungeon, errors);
  checkAnchorsValid(dungeon, errors);
  checkLegendFaithful(dungeon, errors);
  checkNoteBudget(dungeon, errors);
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/validate.test.js`
Expected: PASS (6 tests)

If the two happy-path tests fail, read the printed `errors` array (add a temporary `console.log(result.errors)` if needed) — see the troubleshooting note at the end of Task 7 before changing the invariant logic.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/validate.js packages/core/test/validate.test.js
git commit -m "feat(core): add validateDungeon (SPEC.md §6 invariants 1-14)"
```

---

### Task 7: Property test — many seeds through generate + validate

**Files:**
- Create: `packages/core/test/property.test.js`

**Interfaces:**
- Consumes: `generateDungeon` (Task 5), `validateDungeon` (Task 6).
- Produces: nothing consumed by later tasks — this is the plan's final integration check, matching SPEC.md §8's M7 milestone ("Validador + 10.000 seeds em CI. Zero falhas").

- [ ] **Step 1: Write the test**

```js
// packages/core/test/property.test.js
import { describe, it, expect } from 'vitest';
import { generateDungeon } from '../src/pipeline.js';
import { validateDungeon } from '../src/validate.js';

// SPEC.md §6 mandates running the validator over 10,000 seeds in CI. That's
// too slow for the inner dev loop, so the count is configurable — set
// DUNGEON_FORGE_PROPERTY_SEEDS=10000 in CI, leave the smaller default locally.
const SEED_COUNT = Number(process.env.DUNGEON_FORGE_PROPERTY_SEEDS ?? 200);

const CONFIG = {
  floors: 2,
  width: 30,
  height: 30,
  rooms: { count: 6, sizeMean: 6, sizeStdDev: 2, sizeMin: 3, sizeMax: 10, spawnRadius: 12, separationIters: 40 },
  cycleRate: 0.25,
  verticalLinksPerGap: 1,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

describe(`validator property test (${SEED_COUNT} seeds)`, () => {
  it('every seed produces a Dungeon with zero validator errors', () => {
    const failures = [];
    for (let i = 0; i < SEED_COUNT; i++) {
      const seed = `property-seed-${i}`;
      const dungeon = generateDungeon({ ...CONFIG, seed });
      const result = validateDungeon(dungeon);
      if (!result.ok) {
        failures.push({ seed, errors: result.errors });
      }
    }
    if (failures.length > 0) {
      const preview = failures.slice(0, 5)
        .map((f) => `${f.seed}: ${f.errors.map((e) => `[${e.code}] ${e.message}`).join('; ')}`)
        .join('\n');
      throw new Error(`${failures.length}/${SEED_COUNT} seeds failed validation:\n${preview}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run packages/core/test/property.test.js`
Expected: PASS — `0/200 seeds failed validation`

**If it fails:** the error `preview` in the thrown message names the failing `code`(s) and `seed`(s). Do not weaken an invariant in `validate.js` to make a real generation bug pass — the two most likely real culprits, given this plan's design:
- `anchor-valid` firing on a legitimately tiny room: only expected if `rooms.sizeMin` is set below ~2 cells in some config; the property test's own `CONFIG.rooms.sizeMin: 3` should never trigger this.
- `wall-budget`/`note-budget` firing on a config with a very high `rooms.count` relative to `width`/`height`: expected behavior (the budget is doing its job), not a bug — don't "fix" it by raising the threshold; instead use realistic config values.

Reproduce a specific failing seed directly:

```bash
node -e "
import('./packages/core/src/pipeline.js').then(async ({ generateDungeon }) => {
  const { validateDungeon } = await import('./packages/core/src/validate.js');
  const dungeon = generateDungeon({ floors: 2, width: 30, height: 30, rooms: { count: 6, sizeMean: 6, sizeStdDev: 2, sizeMin: 3, sizeMax: 10, spawnRadius: 12, separationIters: 40 }, cycleRate: 0.25, verticalLinksPerGap: 1, carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 }, pruneIterations: 8, key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true }, seed: 'property-seed-<N>' });
  console.log(JSON.stringify(validateDungeon(dungeon).errors, null, 2));
});
"
```

(Replace `<N>` with the failing index from the test output.)

- [ ] **Step 3: Run the full core test suite one more time**

Run: `npx vitest run packages/core`
Expected: PASS — every file green, including all of Tasks 1–7's tests

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/property.test.js
git commit -m "test(core): add validator property test over configurable seed count"
```

---

### Task 8: `pipeline.js` — resolve residual room overlaps after clamping

**Added post-hoc:** Task 7's property test found real generation defects unrelated to Task 7 itself — `generateDungeon` (already merged, Task 5) can leave two rooms on the same floor overlapping. `clampRoomToGrid` (`pipeline.js`) already documents this as a known, supposedly-rare side effect of its bounds clamp; empirically, at the property test's config (`floors:2, width:30, height:30, rooms.count:6, spawnRadius:12, sizeMax:10`) it happens on **139/200 seeds (69.5%)** — not rare at all. When two rooms overlap, the grid stores only a cell kind (`CELL.ROOM`), not a room id, so the overlapping pair silently merges into one blob; `extractWalls` (already merged) can't tell them apart, and the covered room ends up with zero doors, tripping validator invariant 8 (`room-has-door`). This task adds a deterministic post-clamp overlap-resolution pass.

**Files:**
- Modify: `packages/core/src/pipeline.js`
- Modify: `packages/core/test/pipeline.test.js`

**Interfaces:**
- Consumes: nothing new — operates on the same per-floor `rooms` array already built in `generateDungeon`'s floor loop, after `clampRoomToGrid` + id assignment, before `stampRoom`.
- Produces: no new exports. `generateDungeon`'s output changes: rooms on the same floor never overlap.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/pipeline.test.js` (inside the existing `describe('generateDungeon', ...)` block, using the file's existing `CONFIG`/`MULTI_FLOOR_CONFIG` and vitest imports already present):

```js
  it('never leaves two rooms on the same floor overlapping, even at a cramped config', () => {
    const TIGHT_CONFIG = {
      seed: 'overlap-check',
      floors: 2,
      width: 30,
      height: 30,
      rooms: { count: 6, sizeMean: 6, sizeStdDev: 2, sizeMin: 3, sizeMax: 10, spawnRadius: 12, separationIters: 40 },
      cycleRate: 0.25,
      verticalLinksPerGap: 1,
      carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
      pruneIterations: 8,
      key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
    };
    const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (let i = 0; i < 50; i++) {
      const dungeon = generateDungeon({ ...TIGHT_CONFIG, seed: `overlap-check-${i}` });
      const byFloor = new Map();
      for (const r of dungeon.rooms) {
        if (!byFloor.has(r.floor)) byFloor.set(r.floor, []);
        byFloor.get(r.floor).push(r);
      }
      for (const rooms of byFloor.values()) {
        for (let a = 0; a < rooms.length; a++) {
          for (let b = a + 1; b < rooms.length; b++) {
            expect(rectsOverlap(rooms[a], rooms[b])).toBe(false);
          }
        }
      }
    }
  });

  it('keeps every room within grid bounds after overlap resolution', () => {
    const dungeon = generateDungeon(MULTI_FLOOR_CONFIG);
    for (const r of dungeon.rooms) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(dungeon.width);
      expect(r.y + r.h).toBeLessThanOrEqual(dungeon.height);
    }
  });
```

- [ ] **Step 2: Run tests to verify the first one fails**

Run: `npx vitest run packages/core/test/pipeline.test.js`
Expected: FAIL on "never leaves two rooms on the same floor overlapping..." (some seeds in the 50 will show `rectsOverlap(...)` returning `true`)

- [ ] **Step 3: Write the implementation**

**Revision note (round 2):** the first version of this task specified a pairwise push-apart algorithm. An implementer's TDD run found it doesn't terminate correctly for clusters of 3+ mutually-overlapping rooms — pushing away from room A can reintroduce overlap with room B, oscillating rather than converging. The corrected algorithm below replaces pairwise pushing with a direct free-space scan, which is trivially correct (it only ever accepts a position with zero overlap, verified by construction) and always terminates (bounded by `width * height` grid cells).

In `packages/core/src/pipeline.js`, add two new functions after `nearestRoom` (before `linkFootprintCenter`):

```js
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function overlapsAny(room, placed) {
  return placed.some((other) => rectsOverlap(room, other));
}

/**
 * Scans grid positions in row-major order and returns the first one where a
 * room of `room.w x room.h` doesn't overlap anything in `placed`. Returns
 * null if no such position exists anywhere on the floor.
 */
function findFreePosition(room, placed, width, height) {
  for (let y = 0; y <= height - room.h; y++) {
    for (let x = 0; x <= width - room.w; x++) {
      const candidate = { x, y, w: room.w, h: room.h };
      if (!overlapsAny(candidate, placed)) return { x, y };
    }
  }
  return null;
}

/**
 * Deterministically resolves any residual overlap between rooms on the same
 * floor. placeRooms' steering separation (SPEC.md §5.3) and clampRoomToGrid's
 * defensive bounds clamp can each leave two rooms overlapping. An overlapping
 * pair silently merges into one blob in the grid (CELL.ROOM carries no room
 * id), so extractWalls can't tell the rooms apart and the covered room ends
 * up with zero doors (SPEC.md §6 invariant 8). Rooms are processed in id
 * order and only ever relocated relative to already-placed earlier rooms —
 * a room that still overlaps after relocation is left in place (rather than
 * looping forever) on the rare floor with no free space of its size left;
 * downstream validation surfaces that case the same way it always did,
 * instead of this pass masking it with a nonsensical result.
 * @param {import('./types.js').Room[]} rooms
 * @param {number} width @param {number} height
 */
function resolveOverlaps(rooms, width, height) {
  const placed = [];
  for (const room of rooms) {
    if (overlapsAny(room, placed)) {
      const spot = findFreePosition(room, placed, width, height);
      if (spot) {
        room.x = spot.x;
        room.y = spot.y;
        room.cx = room.x + room.w / 2;
        room.cy = room.y + room.h / 2;
      }
    }
    placed.push(room);
  }
}
```

Then, inside `generateDungeon`'s floor loop, change:

```js
    for (const room of rooms) {
      clampRoomToGrid(room, width, height);
      room.id = nextRoomId++;
    }
    for (const room of rooms) stampRoom(grid, room, floor, width, height);
```

to:

```js
    for (const room of rooms) {
      clampRoomToGrid(room, width, height);
      room.id = nextRoomId++;
    }
    resolveOverlaps(rooms, width, height);
    for (const room of rooms) stampRoom(grid, room, floor, width, height);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/pipeline.test.js`
Expected: PASS (all tests, including the 2 new ones)

Then run the full core suite:

Run: `npx vitest run packages/core`
Expected: PASS (all files)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pipeline.js packages/core/test/pipeline.test.js
git commit -m "fix(core): resolve residual room overlaps after clamping"
```

---

### Task 9: `08-mission.js` — give every leaf room a content-bearing role

**Added post-hoc:** Task 7's property test also found that `mission()` (already merged, pre-existing file from the M0-M3 plan) leaves some degree-1 (leaf) rooms with role `'filler'` whenever they're neither the entrance, the climax, nor reachable only via a cycle edge (the current definition of `'treasure'`). SPEC.md §5.10's role table has no entry for this case, and validator invariant 6 (`checkNoContentlessDeadEnds`, Task 6) correctly flags it: a leaf room, by definition, is a dead end, and `'filler'` means "no narrative content" — so a `'filler'` leaf is exactly the "beco sem conteúdo" (content-less dead end) the invariant exists to catch.

**Files:**
- Modify: `packages/core/src/stages/08-mission.js`
- Modify: `packages/core/test/stages/08-mission.test.js`

**Interfaces:**
- Consumes/produces: no signature change. `mission(rooms, edges)` still returns the same shape; only the `role` values it assigns onto `rooms` change for a subset of leaf rooms (from `'filler'` to `'treasure'`).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/stages/08-mission.test.js` (using the file's existing `room()` helper and imports):

```js
  it('never leaves a leaf (degree-1) room with role filler', () => {
    // A star: hub 0 connects to four leaves (1,2,3,4). Two of them become
    // entrance/climax; the other two have no cycle edge, so under the old
    // role table they'd fall through to 'filler' despite being dead ends.
    const rooms = [room(0, 0, 0), room(1, 1, 1), room(2, -1, 1), room(3, 1, -1), room(4, -1, -1)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 0, b: 2, weight: 1, kind: 'mst' },
      { a: 0, b: 3, weight: 1, kind: 'mst' },
      { a: 0, b: 4, weight: 1, kind: 'mst' },
    ];
    mission(rooms, edges);
    const degree = new Map(rooms.map((r) => [r.id, 0]));
    for (const e of edges) {
      degree.set(e.a, degree.get(e.a) + 1);
      degree.set(e.b, degree.get(e.b) + 1);
    }
    for (const r of rooms) {
      if (degree.get(r.id) === 1) {
        expect(r.role).not.toBe('filler');
      }
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/stages/08-mission.test.js`
Expected: FAIL — at least one of leaves 1-4 (whichever aren't entrance/climax) has `role === 'filler'`

- [ ] **Step 3: Write the implementation**

In `packages/core/src/stages/08-mission.js`, find the final role-assignment loop (near the end of the `mission` function):

```js
  for (const r of rooms) {
    if (r.id === entrance.id) {
      r.role = 'entrance';
    } else if (r.role === 'treasure') {
      // already set above; preserve treasure role
    } else if (r.id === climax.id) {
      r.role = 'climax';
    } else if (degree.get(r.id) >= 3) {
      r.role = 'junction';
    } else {
      r.role = 'filler';
    }
  }
```

Replace the final `else` branch so a degree-1 room also gets a content-bearing role:

```js
  for (const r of rooms) {
    if (r.id === entrance.id) {
      r.role = 'entrance';
    } else if (r.role === 'treasure') {
      // already set above; preserve treasure role
    } else if (r.id === climax.id) {
      r.role = 'climax';
    } else if (degree.get(r.id) >= 3) {
      r.role = 'junction';
    } else if (degree.get(r.id) === 1) {
      // A dead-end room that isn't the entrance/climax and wasn't already
      // marked treasure (cycle-only reachable) is still a leaf with no
      // designated role under SPEC.md §5.10's table — leaving it 'filler'
      // violates §6 invariant 6 ("nenhuma folha filler sem saída"). Folding
      // it into 'treasure' keeps every leaf content-bearing; it's still
      // narratively an optional branch off the main path, same as the
      // stricter cycle-only case.
      r.role = 'treasure';
    } else {
      r.role = 'filler';
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/08-mission.test.js`
Expected: PASS (all tests in the file, including the new one)

Then run the full core suite:

Run: `npx vitest run packages/core`
Expected: PASS (all files)

Then run the property test to confirm the two fixes (Task 8 + Task 9) together clear the failures Task 7 originally found:

Run: `DUNGEON_FORGE_PROPERTY_SEEDS=200 npx vitest run packages/core/test/property.test.js`
Expected: PASS — `0/200 seeds failed validation`

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/08-mission.js packages/core/test/stages/08-mission.test.js
git commit -m "fix(core): give every leaf room a content-bearing role (never filler)"
```

---

### Task 10: `10-extract-walls.js` — treat `CELL.STAIR` as a door-eligible neighbor

**Added post-hoc:** Investigating residual `room-has-door` property-test failures after Task 8 found a second, distinct cause (2 of 45 cases): a room can end up directly boundary-adjacent to a `VerticalLink` footprint (`CELL.STAIR`), placed there by `chooseVerticalLinks`'s proximity search (Task 1) and connected by `carveToPoint` (Task 2). `extractWalls`' door detection (`collectDoorEdges` in this file, pre-existing, unmodified by any earlier task in this plan) only recognizes `CELL.HALLWAY` on the far side of a room boundary cell as door-worthy — it never checks `CELL.STAIR`. SPEC.md §5.12 itself defines the walkable mask `extractWalls` walks as `ROOM | HALLWAY | STAIR`, so this is a straightforward pre-existing gap in an already-merged file, newly reachable now that `STAIR` cells exist next to rooms at all (single-floor generation never produced any).

**Files:**
- Modify: `packages/core/src/stages/10-extract-walls.js`
- Modify: `packages/core/test/stages/10-extract-walls.test.js`

**Interfaces:**
- Consumes/produces: no signature change. `extractWalls(grid, width, height, floor, rooms)` still returns the same `{ walls, doors }` shape; it now additionally emits a door wherever a room boundary touches `CELL.STAIR`, same as it already does for `CELL.HALLWAY`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/stages/10-extract-walls.test.js` (using the file's existing `room()`/`stamp()` helpers and imports already present):

```js
  it('registers a door where a room boundary touches a CELL.STAIR cell (vertical link footprint)', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 4, 4);
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    // A vertical-link footprint sitting directly against the room's east wall.
    setCell(grid, 6, 3, 0, width, height, CELL.STAIR);

    const { walls, doors } = extractWalls(grid, width, height, 0, [r0]);
    expect(doors.length).toBeGreaterThan(0);
    expect(r0.doors.length).toBeGreaterThan(0);
    const doorWalls = walls.filter((w) => w.isDoor);
    expect(doorWalls.some((w) => w.x1 === 6 && w.y1 === 3 && w.x2 === 6 && w.y2 === 4)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/stages/10-extract-walls.test.js`
Expected: FAIL — `doors.length` is 0 (no door registered against the STAIR cell)

- [ ] **Step 3: Write the implementation**

In `packages/core/src/stages/10-extract-walls.js`, add a helper right after the existing `isWalkable` function:

```js
function isDoorNeighbor(value) {
  return value === CELL.HALLWAY || value === CELL.STAIR;
}
```

Then in `collectDoorEdges`, replace all four `=== CELL.HALLWAY` checks with `isDoorNeighbor(...)`:

```js
function collectDoorEdges(grid, width, height, floor, rooms) {
  const horizontal = []; // door edge at row y, between (x,y-1) and (x,y)
  const vertical = [];   // door edge at column x, between (x-1,y) and (x,y)

  for (const room of rooms) {
    // North edge: outside cell is (x, room.y - 1)
    for (let x = room.x; x < room.x + room.w; x++) {
      if (isDoorNeighbor(cellValueAt(grid, x, room.y - 1, floor, width, height))) {
        horizontal.push({ x, y: room.y, roomId: room.id });
      }
    }
    // South edge: outside cell is (x, room.y + room.h)
    for (let x = room.x; x < room.x + room.w; x++) {
      if (isDoorNeighbor(cellValueAt(grid, x, room.y + room.h, floor, width, height))) {
        horizontal.push({ x, y: room.y + room.h, roomId: room.id });
      }
    }
    // West edge: outside cell is (room.x - 1, y)
    for (let y = room.y; y < room.y + room.h; y++) {
      if (isDoorNeighbor(cellValueAt(grid, room.x - 1, y, floor, width, height))) {
        vertical.push({ x: room.x, y, roomId: room.id });
      }
    }
    // East edge: outside cell is (room.x + room.w, y)
    for (let y = room.y; y < room.y + room.h; y++) {
      if (isDoorNeighbor(cellValueAt(grid, room.x + room.w, y, floor, width, height))) {
        vertical.push({ x: room.x + room.w, y, roomId: room.id });
      }
    }
  }

  return { horizontal, vertical };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/10-extract-walls.test.js`
Expected: PASS (all tests in the file, including the new one)

Then run the full core suite:

Run: `npx vitest run packages/core`
Expected: PASS (all files)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/10-extract-walls.js packages/core/test/stages/10-extract-walls.test.js
git commit -m "fix(core): recognize CELL.STAIR as a door-eligible room-boundary neighbor"
```

---

### Task 11: `pipeline.js` — enforce a minimum 1-cell room separation, not just non-overlap

**Added post-hoc:** Investigating residual `room-has-door` property-test failures after Task 8 found the dominant remaining cause (43 of 45 cases): two rooms placed directly touching (zero-cell gap) but not overlapping. Task 8's `resolveOverlaps` only guarantees rooms don't *overlap* — SPEC.md §5.3 states the stronger invariant directly: "toda sala tem ≥1 célula de folga em cada lado" (every room has ≥1 cell of clearance on every side). When two rooms touch with zero gap, `carve()`'s A* path between them can run entirely through already-`CELL.ROOM` cells with no `CELL.EMPTY` cell to convert to `CELL.HALLWAY` — so no hallway ever gets carved, and `extractWalls` (both rooms being walkable on both sides of their shared boundary) never sees a walkability transition there, so no door is registered either.

**Files:**
- Modify: `packages/core/src/pipeline.js`
- Modify: `packages/core/test/pipeline.test.js`

**Interfaces:**
- Consumes/produces: no new exports. Strengthens the `resolveOverlaps` pass added in Task 8 (same call site, same floor loop) to reject zero-gap adjacency, not just overlap.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/pipeline.test.js` (inside the existing `describe('generateDungeon', ...)` block):

```js
  it('never leaves two rooms on the same floor touching with zero gap between them', () => {
    const TIGHT_CONFIG = {
      seed: 'gap-check',
      floors: 2,
      width: 30,
      height: 30,
      rooms: { count: 6, sizeMean: 6, sizeStdDev: 2, sizeMin: 3, sizeMax: 10, spawnRadius: 12, separationIters: 40 },
      cycleRate: 0.25,
      verticalLinksPerGap: 1,
      carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
      pruneIterations: 8,
      key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
    };
    const tooClose = (a, b) =>
      a.x < b.x + b.w + 1 && a.x + a.w + 1 > b.x && a.y < b.y + b.h + 1 && a.y + a.h + 1 > b.y;
    for (let i = 0; i < 50; i++) {
      const dungeon = generateDungeon({ ...TIGHT_CONFIG, seed: `gap-check-${i}` });
      const byFloor = new Map();
      for (const r of dungeon.rooms) {
        if (!byFloor.has(r.floor)) byFloor.set(r.floor, []);
        byFloor.get(r.floor).push(r);
      }
      for (const rooms of byFloor.values()) {
        for (let a = 0; a < rooms.length; a++) {
          for (let b = a + 1; b < rooms.length; b++) {
            expect(tooClose(rooms[a], rooms[b])).toBe(false);
          }
        }
      }
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/pipeline.test.js`
Expected: FAIL — some seeds in the 50 show `tooClose(...)` returning `true` (rooms touching with zero gap)

- [ ] **Step 3: Write the implementation**

In `packages/core/src/pipeline.js`, `rectsOverlap` currently reads:

```js
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
```

Replace it with a version padded by 1 cell on each side, so it rejects zero-gap adjacency as well as true overlap — and rename it to `tooClose` to describe what it now checks (update its one call site inside `overlapsAny`, and the doc comment on `resolveOverlaps` that references it):

```js
function tooClose(a, b) {
  return a.x < b.x + b.w + 1 && a.x + a.w + 1 > b.x && a.y < b.y + b.h + 1 && a.y + a.h + 1 > b.y;
}
```

Update `overlapsAny` to call `tooClose` instead of `rectsOverlap`:

```js
function overlapsAny(room, placed) {
  return placed.some((other) => tooClose(room, other));
}
```

Update `resolveOverlaps`'s doc comment to say "resolves any residual overlap **or zero-gap adjacency**" instead of just "overlap", and add one sentence: "SPEC.md §5.3 requires ≥1 cell of clearance on every side of a room — `tooClose` checks that directly by padding each room's far edge by 1 cell before testing intersection, so two rooms are rejected as conflicting whenever their gap is less than 1 cell, not only when they actually overlap." No other code in `resolveOverlaps`/`findFreePosition` needs to change — they already call `overlapsAny`, which now enforces the stronger invariant everywhere it was already being enforced.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/pipeline.test.js`
Expected: PASS (all tests, including the new one)

Then run the full core suite:

Run: `npx vitest run packages/core`
Expected: PASS (all files)

Then run the property test to confirm this fix, combined with Tasks 9 and 10, clears the failures Task 7 originally found:

Run: `DUNGEON_FORGE_PROPERTY_SEEDS=200 npx vitest run packages/core/test/property.test.js`
Expected: PASS — `0/200 seeds failed validation`

If it still fails, do not weaken `validate.js` or this test — report the remaining failures (seeds + error codes) back; a further investigation task may be needed, same as this one was.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pipeline.js packages/core/test/pipeline.test.js
git commit -m "fix(core): require >=1 cell room separation, not just non-overlap"
```

---

## After this plan lands

- `harness/src/main.js` still hardcodes `floors: 1` in its `DEFAULT_CONFIG` — trivial to bump once someone wants to eyeball a multi-floor preview, but that's a `render`/`harness` change, out of scope here.
- `adapter-foundry` (M4a/M4b) can start once the project owner supplies `fixtures/golden-scene-v14.json`, `fixtures/golden-scene-v13-floor-a.json`, and `fixtures/golden-scene-v13-floor-b.json` per SPEC.md §2.4 — that unlocks a `config.target` field on `Config`, which is also when invariants 7/14's target-conditional budgeting and invariant 15 (Note↔page linkage) become implementable.
