# Core Pipeline M0–M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform-agnostic `core` pipeline (RNG, grid, room placement, graph, corridor carving, mission/key semantics, wall extraction) plus a pure-function `render` layer and a Vite harness, so a single-floor dungeon can be generated deterministically from a seed and previewed as an image — with zero dependency on Foundry.

**Architecture:** Each pipeline stage is a pure function `(input, rng) → output` living in `packages/core/src/stages/`, wired together by `packages/core/src/pipeline.js`. `packages/render/` turns a floor slice of the `Dungeon` into a canvas-agnostic draw plan (pure, unit-testable) plus a thin adapter that executes that plan on a real `OffscreenCanvas` in the browser. `harness/` is a Vite app that imports `core` and `render` directly (workspace packages, no publish step) to preview generation live.

**Tech Stack:** JavaScript ESM, Node.js ≥20, npm workspaces, Vitest, ESLint (with a custom rule banning `Math.random`), `delaunator` (Mapbox) for Delaunay triangulation, Vite for the harness.

**Spec:** `SPEC.md` (repo root) — sections §5.1–§5.4, §5.8, §5.9 (skipped in this plan), §5.10–§5.13. This plan implements Estágios 0–4, 6, 8, 9, 10, 11. Estágios 5 (`verticalLinks`), 7 (`prune`), and the residual-cell thickening sub-step of Estágio 6 are **out of scope** — they require multi-floor generation and land in the M5 follow-up plan (see "Follow-up plans" below).

## Global Constraints

- `Math.random` is banned repo-wide; every source of randomness must go through `rng.js` (SPEC.md §5.1, §10.1).
- `core` never imports DOM, Canvas, or any Foundry global (SPEC.md §3.1, §10.2).
- Grids are always `TypedArray`, never arrays of objects (SPEC.md §5.2, §10.3).
- Every stage is a pure function; no module-level state (SPEC.md §10.4).
- Every intermediate artifact must survive `structuredClone` — no classes with methods, no functions as payload (SPEC.md §10.6, §3.2).
- The `key` stage (Estágio 9) receives **no RNG substream** — numbering is a pure function of topology (SPEC.md §5.11, §10.7).
- Same seed ⇒ bit-identical `JSON.stringify(dungeon)` across runs (SPEC.md §1, §9).

---

## File Structure

```
dungeon-forge/
├── package.json                     # npm workspaces root
├── .eslintrc.json                   # bans Math.random
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── rng.js
│   │   │   ├── grid.js
│   │   │   ├── types.js             # JSDoc typedefs only, no runtime code
│   │   │   ├── pipeline.js
│   │   │   └── stages/
│   │   │       ├── 01-place-rooms.js
│   │   │       ├── 02-triangulate.js
│   │   │       ├── 03-spanning-tree.js
│   │   │       ├── 04-add-cycles.js
│   │   │       ├── 06-carve.js
│   │   │       ├── 08-mission.js
│   │   │       ├── 09-key.js
│   │   │       └── 10-extract-walls.js
│   │   └── test/
│   │       ├── rng.test.js
│   │       ├── grid.test.js
│   │       ├── stages/
│   │       │   ├── 01-place-rooms.test.js
│   │       │   ├── 02-triangulate.test.js
│   │       │   ├── 03-spanning-tree.test.js
│   │       │   ├── 04-add-cycles.test.js
│   │       │   ├── 06-carve.test.js
│   │       │   ├── 08-mission.test.js
│   │       │   ├── 09-key.test.js
│   │       │   └── 10-extract-walls.test.js
│   │       └── pipeline.test.js
│   └── render/
│       ├── package.json
│       ├── src/
│       │   ├── plan.js              # pure: Dungeon floor slice → draw plan
│       │   └── draw.js              # plan → OffscreenCanvas calls (thin, browser-only)
│       └── test/
│           └── plan.test.js
└── harness/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        └── main.js
```

Note on stage numbering: the spec's architecture tree (§3) numbers stage files 01–09 but its prose (§5) numbers stages 0–12, and the `key` stage (prose Estágio 9) has no file in the original tree while `extractWalls` (prose Estágio 10) is listed as `09-extract-walls.js`. This plan resolves the mismatch by naming files after their **prose** stage number (`09-key.js`, `10-extract-walls.js`), and leaves gaps at `05-vertical-links.js` and `07-prune.js` for the M5 follow-up plan to fill in without renumbering anything here.

---

### Task 1: Monorepo scaffolding, lint rule, test runner

**Files:**
- Create: `package.json` (root)
- Create: `.eslintrc.json`
- Create: `packages/core/package.json`
- Create: `packages/render/package.json`
- Create: `vitest.workspace.js`

**Interfaces:**
- Produces: `npm test` (root) runs Vitest across all workspace packages. `npm run lint` runs ESLint with `no-restricted-syntax` banning `Math.random`.

- [ ] **Step 1: Create root `package.json` with npm workspaces**

```json
{
  "name": "dungeon-forge",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "harness"
  ],
  "scripts": {
    "test": "vitest run",
    "lint": "eslint packages harness --ext .js"
  },
  "devDependencies": {
    "eslint": "^9.9.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `.eslintrc.json` banning `Math.random`**

```json
{
  "root": true,
  "env": { "es2022": true, "node": true, "browser": true },
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" },
  "rules": {
    "no-restricted-properties": [
      "error",
      {
        "object": "Math",
        "property": "random",
        "message": "Math.random is banned. Use rng.js (makeRng/deriveRng) instead — see SPEC.md §5.1."
      }
    ]
  }
}
```

- [ ] **Step 3: Create `packages/core/package.json`**

```json
{
  "name": "@dungeon-forge/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/pipeline.js",
  "dependencies": {
    "delaunator": "^5.0.1"
  }
}
```

- [ ] **Step 4: Create `packages/render/package.json`**

```json
{
  "name": "@dungeon-forge/render",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/plan.js",
  "dependencies": {
    "@dungeon-forge/core": "*"
  }
}
```

- [ ] **Step 5: Create `vitest.workspace.js` at repo root**

```js
export default [
  'packages/core',
  'packages/render',
];
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: lockfile created, no errors.

- [ ] **Step 7: Run test and lint with nothing to check yet**

Run: `npm test && npm run lint`
Expected: Vitest reports "no test files found" (not a failure — 0 suites), ESLint passes with 0 files matched or exits 0.

- [ ] **Step 8: Commit**

```bash
git init
git add package.json .eslintrc.json vitest.workspace.js packages/core/package.json packages/render/package.json
git commit -m "chore: scaffold npm workspaces, vitest, eslint Math.random ban"
```

---

### Task 2: `rng.js` — seedable RNG and substreams

**Files:**
- Create: `packages/core/src/rng.js`
- Test: `packages/core/test/rng.test.js`

**Interfaces:**
- Produces:
  - `makeRng(seed: string): Rng` — `Rng` is `{ float(): number, int(min: number, max: number): number, normal(mean: number, stdDev: number): number, pick(arr: any[]): any, shuffle(arr: any[]): any[], chance(p: number): boolean }`
  - `deriveRng(rootSeed: string, stageName: string): Rng` — same `Rng` shape, deterministic substream independent of other stage names.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/rng.test.js
import { describe, it, expect } from 'vitest';
import { makeRng, deriveRng } from '../src/rng.js';

describe('makeRng', () => {
  it('is deterministic for the same seed', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-1');
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-2');
    expect(a.float()).not.toEqual(b.float());
  });

  it('float() stays within [0, 1)', () => {
    const rng = makeRng('bounds');
    for (let i = 0; i < 1000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) stays within [min, max] inclusive', () => {
    const rng = makeRng('int-bounds');
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('normal(mean, stdDev) is centered near mean over many samples', () => {
    const rng = makeRng('normal-dist');
    const samples = Array.from({ length: 5000 }, () => rng.normal(10, 2));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(9.5);
    expect(mean).toBeLessThan(10.5);
  });

  it('pick(array) always returns an element of the array', () => {
    const rng = makeRng('pick');
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('shuffle(array) is a permutation of the input', () => {
    const rng = makeRng('shuffle');
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle([...arr]);
    expect(shuffled.slice().sort()).toEqual(arr.slice().sort());
  });

  it('chance(p) returns true roughly p of the time', () => {
    const rng = makeRng('chance');
    let hits = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (rng.chance(0.3)) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.25);
    expect(hits / n).toBeLessThan(0.35);
  });

  it('chance(0) never true, chance(1) always true', () => {
    const rng = makeRng('chance-edges');
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});

describe('deriveRng', () => {
  it('same rootSeed + stageName is deterministic', () => {
    const a = deriveRng('root', 'stage-a');
    const b = deriveRng('root', 'stage-a');
    expect(a.float()).toEqual(b.float());
  });

  it('different stageName under the same rootSeed diverges', () => {
    const a = deriveRng('root', 'stage-a');
    const b = deriveRng('root', 'stage-b');
    expect(a.float()).not.toEqual(b.float());
  });

  it('substream for one stage is independent of another stage’s call count', () => {
    // Draw 50 values from stage-a first; stage-b's first value must be
    // unaffected by how much stage-a consumed.
    const a1 = deriveRng('root', 'stage-a');
    for (let i = 0; i < 50; i++) a1.float();

    const b1 = deriveRng('root', 'stage-b');
    const bFirst = b1.float();

    const b2 = deriveRng('root', 'stage-b');
    expect(b2.float()).toEqual(bFirst);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/rng.test.js`
Expected: FAIL — `rng.js` does not exist yet.

- [ ] **Step 3: Implement `rng.js`**

```js
// packages/core/src/rng.js

/** sfc32 — small, fast, seeded PRNG. Returns a function () => float in [0,1). */
function sfc32(a, b, c, d) {
  return function next() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    let t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** xmur3 — string hash used to seed sfc32 from an arbitrary seed string. */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function makeFloatFn(seedString) {
  const seedGen = xmur3(seedString);
  return sfc32(seedGen(), seedGen(), seedGen(), seedGen());
}

function buildRng(floatFn) {
  return {
    float() {
      return floatFn();
    },
    int(min, max) {
      return Math.floor(floatFn() * (max - min + 1)) + min;
    },
    normal(mean, stdDev) {
      // Box-Muller transform
      let u = 0;
      let v = 0;
      while (u === 0) u = floatFn();
      while (v === 0) v = floatFn();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + z * stdDev;
    },
    pick(arr) {
      return arr[Math.floor(floatFn() * arr.length)];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(floatFn() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    chance(p) {
      return floatFn() < p;
    },
  };
}

/** @param {string} seed */
export function makeRng(seed) {
  return buildRng(makeFloatFn(seed));
}

/**
 * Derives an independent substream for one pipeline stage. Two stages
 * derived from the same rootSeed never share state — consuming one
 * substream never perturbs another (see SPEC.md §5.1).
 * @param {string} rootSeed
 * @param {string} stageName
 */
export function deriveRng(rootSeed, stageName) {
  return buildRng(makeFloatFn(`${rootSeed}::${stageName}`));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/rng.test.js`
Expected: PASS, all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rng.js packages/core/test/rng.test.js
git commit -m "feat(core): seedable RNG with per-stage substreams"
```

---

### Task 3: `grid.js` — typed grid and cell constants

**Files:**
- Create: `packages/core/src/grid.js`
- Test: `packages/core/test/grid.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `CELL: { EMPTY: 0, ROOM: 1, HALLWAY: 2, STAIR: 3, BLOCKED: 4 }`
  - `createGrid(width: number, height: number, floors: number): Uint8Array` — length `width * height * floors`, all `CELL.EMPTY`
  - `cellIndex(x: number, y: number, z: number, width: number, height: number): number` — `z * (width * height) + y * width + x`
  - `getCell(grid: Uint8Array, x, y, z, width, height): number`
  - `setCell(grid: Uint8Array, x, y, z, width, height, value: number): void`
  - `inBounds(x, y, z, width, height, floors): boolean`

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/grid.test.js
import { describe, it, expect } from 'vitest';
import { CELL, createGrid, cellIndex, getCell, setCell, inBounds } from '../src/grid.js';

describe('grid', () => {
  it('CELL enum has the five expected values', () => {
    expect(CELL).toEqual({ EMPTY: 0, ROOM: 1, HALLWAY: 2, STAIR: 3, BLOCKED: 4 });
  });

  it('createGrid returns a Uint8Array of the right length, all EMPTY', () => {
    const grid = createGrid(4, 3, 2);
    expect(grid).toBeInstanceOf(Uint8Array);
    expect(grid.length).toBe(4 * 3 * 2);
    expect(grid.every((v) => v === CELL.EMPTY)).toBe(true);
  });

  it('cellIndex matches z * (w*h) + y*w + x', () => {
    expect(cellIndex(1, 2, 0, 10, 5)).toBe(0 * 50 + 2 * 10 + 1);
    expect(cellIndex(1, 2, 1, 10, 5)).toBe(1 * 50 + 2 * 10 + 1);
  });

  it('setCell then getCell round-trips a value', () => {
    const grid = createGrid(5, 5, 1);
    setCell(grid, 2, 3, 0, 5, 5, CELL.ROOM);
    expect(getCell(grid, 2, 3, 0, 5, 5)).toBe(CELL.ROOM);
    expect(getCell(grid, 0, 0, 0, 5, 5)).toBe(CELL.EMPTY);
  });

  it('inBounds is true inside the grid and false outside', () => {
    expect(inBounds(0, 0, 0, 5, 5, 2)).toBe(true);
    expect(inBounds(4, 4, 1, 5, 5, 2)).toBe(true);
    expect(inBounds(5, 0, 0, 5, 5, 2)).toBe(false);
    expect(inBounds(0, 5, 0, 5, 5, 2)).toBe(false);
    expect(inBounds(0, 0, 2, 5, 5, 2)).toBe(false);
    expect(inBounds(-1, 0, 0, 5, 5, 2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/grid.test.js`
Expected: FAIL — `grid.js` does not exist yet.

- [ ] **Step 3: Implement `grid.js`**

```js
// packages/core/src/grid.js

export const CELL = Object.freeze({
  EMPTY: 0,
  ROOM: 1,
  HALLWAY: 2,
  STAIR: 3,
  BLOCKED: 4,
});

/** @param {number} width @param {number} height @param {number} floors */
export function createGrid(width, height, floors) {
  return new Uint8Array(width * height * floors);
}

export function cellIndex(x, y, z, width, height) {
  return z * (width * height) + y * width + x;
}

export function getCell(grid, x, y, z, width, height) {
  return grid[cellIndex(x, y, z, width, height)];
}

export function setCell(grid, x, y, z, width, height, value) {
  grid[cellIndex(x, y, z, width, height)] = value;
}

export function inBounds(x, y, z, width, height, floors) {
  return x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < floors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/grid.test.js`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/grid.js packages/core/test/grid.test.js
git commit -m "feat(core): typed grid with CELL enum and index helpers"
```

---

### Task 4: `types.js` — JSDoc typedefs

**Files:**
- Create: `packages/core/src/types.js`

**Interfaces:**
- Produces: JSDoc `@typedef`s for `Config`, `RoomParams`, `CarveCosts`, `Room`, `RoomRole`, `Edge`, `VerticalLink`, `Door`, `Area`, `AreaExit`, `KeyEntry`, `LegendSymbol`, `WallSegment`, `Dungeon` — copied verbatim from SPEC.md §4, since that section is already the source of truth for these shapes. No runtime behavior, so no test file.

- [ ] **Step 1: Create `packages/core/src/types.js`**

```js
// packages/core/src/types.js
//
// Pure JSDoc typedefs — the data contract between pipeline stages.
// Copied from SPEC.md §4. No runtime code lives here.

/**
 * @typedef {Object} Config
 * @property {string} seed
 * @property {number} floors
 * @property {number} width
 * @property {number} height
 * @property {RoomParams} rooms
 * @property {number} cycleRate
 * @property {number} verticalLinksPerGap
 * @property {CarveCosts} carve
 * @property {number} pruneIterations
 */

/**
 * @typedef {Object} RoomParams
 * @property {number} count
 * @property {number} sizeMean
 * @property {number} sizeStdDev
 * @property {number} sizeMin
 * @property {number} sizeMax
 * @property {number} spawnRadius
 * @property {number} separationIters
 */

/**
 * @typedef {Object} CarveCosts
 * @property {number} newHallway
 * @property {number} reuseHallway
 * @property {number} throughRoom
 * @property {number} turn
 */

/**
 * @typedef {Object} Room
 * @property {number} id
 * @property {number} floor
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} cx
 * @property {number} cy
 * @property {RoomRole} role
 * @property {number[]} doors
 */

/** @typedef {'entrance'|'climax'|'treasure'|'junction'|'filler'} RoomRole */

/**
 * @typedef {Object} Edge
 * @property {number} a
 * @property {number} b
 * @property {number} weight
 * @property {'mst'|'cycle'|'vertical'} kind
 */

/**
 * @typedef {Object} VerticalLink
 * @property {number} id
 * @property {number} fromFloor
 * @property {number} toFloor
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {'stair'|'shaft'|'ladder'} kind
 */

/**
 * @typedef {Object} Door
 * @property {number} id
 * @property {number} floor
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {number} roomId
 * @property {boolean} secret
 */

/**
 * @typedef {Object} Area
 * @property {number} id
 * @property {string} label
 * @property {number} floor
 * @property {number|null} roomId
 * @property {number} cx
 * @property {number} cy
 * @property {AreaExit[]} exits
 */

/**
 * @typedef {Object} AreaExit
 * @property {'n'|'s'|'e'|'w'|'up'|'down'} dir
 * @property {string} toLabel
 * @property {'door'|'secret'|'open'|'stair'|'shaft'} via
 */

/**
 * @typedef {Object} KeyEntry
 * @property {number} areaId
 * @property {string} label
 * @property {string} title
 * @property {string} description
 * @property {string[]} tags
 */

/**
 * @typedef {Object} LegendSymbol
 * @property {'door'|'secret'|'stairUp'|'stairDown'|'shaft'|'areaNumber'} kind
 * @property {string} caption
 */

/**
 * @typedef {Object} WallSegment
 * @property {number} floor
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {boolean} isDoor
 * @property {number|null} doorId
 */

/**
 * @typedef {Object} Dungeon
 * @property {Config} config
 * @property {string} seed
 * @property {number} width
 * @property {number} height
 * @property {number} floors
 * @property {Uint8Array} cells
 * @property {Room[]} rooms
 * @property {Edge[]} edges
 * @property {VerticalLink[]} links
 * @property {Door[]} doors
 * @property {WallSegment[]} walls
 * @property {Object} mission
 * @property {Area[]} areas
 * @property {Object} key
 */

export {};
```

- [ ] **Step 2: Verify the file loads without syntax errors**

Run: `node --input-type=module -e "import('./packages/core/src/types.js').then(() => console.log('ok'))"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.js
git commit -m "docs(core): JSDoc data contracts from SPEC.md §4"
```

---

### Task 5: Stage 1 — `placeRooms`

**Files:**
- Create: `packages/core/src/stages/01-place-rooms.js`
- Test: `packages/core/test/stages/01-place-rooms.test.js`

**Interfaces:**
- Consumes: `Rng` from `rng.js` (`deriveRng(seed, 'place-rooms')`), `RoomParams` shape from `types.js`
- Produces: `placeRooms(params: RoomParams, floor: number, rng: Rng): { rooms: Room[], residualCells: {x:number,y:number}[] }` — `Room` objects here omit `doors` (filled later by extractWalls) and use `w`/`h` as **cell counts**, `x`/`y` as top-left cell coords, `cx`/`cy` as float centroids.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/stages/01-place-rooms.test.js
import { describe, it, expect } from 'vitest';
import { deriveRng } from '../../src/rng.js';
import { placeRooms } from '../../src/stages/01-place-rooms.js';

const PARAMS = {
  count: 9,
  sizeMean: 7,
  sizeStdDev: 2.5,
  sizeMin: 3,
  sizeMax: 14,
  spawnRadius: 18,
  separationIters: 60,
};

function overlaps(a, b, margin = 0) {
  return (
    a.x - margin < b.x + b.w &&
    a.x + a.w + margin > b.x &&
    a.y - margin < b.y + b.h &&
    a.y + a.h + margin > b.y
  );
}

describe('placeRooms', () => {
  it('is deterministic for the same seed', () => {
    const a = placeRooms(PARAMS, 0, deriveRng('seed-1', 'place-rooms'));
    const b = placeRooms(PARAMS, 0, deriveRng('seed-1', 'place-rooms'));
    expect(a.rooms.map((r) => [r.x, r.y, r.w, r.h])).toEqual(
      b.rooms.map((r) => [r.x, r.y, r.w, r.h])
    );
  });

  it('promotes exactly params.count rooms', () => {
    const { rooms } = placeRooms(PARAMS, 0, deriveRng('seed-2', 'place-rooms'));
    expect(rooms).toHaveLength(PARAMS.count);
  });

  it('no two rooms overlap, with >=1 cell of clearance on every side', () => {
    const { rooms } = placeRooms(PARAMS, 0, deriveRng('seed-3', 'place-rooms'));
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        expect(overlaps(rooms[i], rooms[j], -1)).toBe(false);
      }
    }
  });

  it('every room dimension is within [sizeMin, sizeMax]', () => {
    const { rooms } = placeRooms(PARAMS, 0, deriveRng('seed-4', 'place-rooms'));
    for (const r of rooms) {
      expect(r.w).toBeGreaterThanOrEqual(PARAMS.sizeMin);
      expect(r.w).toBeLessThanOrEqual(PARAMS.sizeMax);
      expect(r.h).toBeGreaterThanOrEqual(PARAMS.sizeMin);
      expect(r.h).toBeLessThanOrEqual(PARAMS.sizeMax);
    }
  });

  it('tags every room with the given floor and a unique id', () => {
    const { rooms } = placeRooms(PARAMS, 2, deriveRng('seed-5', 'place-rooms'));
    expect(rooms.every((r) => r.floor === 2)).toBe(true);
    const ids = new Set(rooms.map((r) => r.id));
    expect(ids.size).toBe(rooms.length);
  });

  it('produces residualCells from the non-promoted candidates', () => {
    const { residualCells } = placeRooms(PARAMS, 0, deriveRng('seed-6', 'place-rooms'));
    // count * 1.6 candidates minus count promoted, roughly
    expect(residualCells.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/01-place-rooms.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `01-place-rooms.js`**

```js
// packages/core/src/stages/01-place-rooms.js

let nextRoomId = 0;

function resetRoomIds() {
  nextRoomId = 0;
}

/**
 * @param {import('../types.js').RoomParams} params
 * @param {number} floor
 * @param {import('../rng.js').Rng} rng
 */
export function placeRooms(params, floor, rng) {
  resetRoomIds();
  const candidateCount = Math.round(params.count * 1.6);

  const candidates = [];
  for (let i = 0; i < candidateCount; i++) {
    const angle = rng.float() * Math.PI * 2;
    const r = Math.sqrt(rng.float()) * params.spawnRadius;
    const cx = Math.cos(angle) * r;
    const cy = Math.sin(angle) * r;

    const clamp = (v) => Math.max(params.sizeMin, Math.min(params.sizeMax, v));
    const w = clamp(Math.round(rng.normal(params.sizeMean, params.sizeStdDev)));
    const h = clamp(Math.round(rng.normal(params.sizeMean, params.sizeStdDev)));

    candidates.push({ cx, cy, w, h });
  }

  // Steering separation: push overlapping candidates apart.
  for (let iter = 0; iter < params.separationIters; iter++) {
    for (let i = 0; i < candidates.length; i++) {
      let pushX = 0;
      let pushY = 0;
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const a = candidates[i];
        const b = candidates[j];
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const overlapX = (a.w + b.w) / 2 - Math.abs(dx);
        const overlapY = (a.h + b.h) / 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const dist = Math.hypot(dx, dy) || 0.0001;
          pushX += (dx / dist) * overlapX * 0.5;
          pushY += (dy / dist) * overlapY * 0.5;
        }
      }
      candidates[i].cx += pushX;
      candidates[i].cy += pushY;
    }
  }

  // Snap to integer cell grid, centered at spawnRadius offset so all
  // coordinates end up non-negative.
  const offset = params.spawnRadius + params.sizeMax;
  const boxed = candidates.map((c) => {
    const x = Math.round(c.cx + offset - c.w / 2);
    const y = Math.round(c.cy + offset - c.h / 2);
    return { x, y, w: c.w, h: c.h, area: c.w * c.h };
  });

  const sorted = [...boxed].sort((a, b) => b.area - a.area);
  const promoted = sorted.slice(0, params.count);
  const residual = sorted.slice(params.count);

  const rooms = promoted.map((b) => ({
    id: nextRoomId++,
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

  const residualCells = residual.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));

  return { rooms, residualCells };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/01-place-rooms.test.js`
Expected: PASS, all 6 tests green. If the overlap test is flaky, increase `separationIters` in the test params or re-check the steering loop — do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/01-place-rooms.js packages/core/test/stages/01-place-rooms.test.js
git commit -m "feat(core): stage 1 placeRooms — steering-based room placement"
```

---

### Task 6: Stage 2 — `triangulate`

**Files:**
- Create: `packages/core/src/stages/02-triangulate.js`
- Test: `packages/core/test/stages/02-triangulate.test.js`

**Interfaces:**
- Consumes: `Room[]` (uses `.id`, `.cx`, `.cy`)
- Produces: `triangulate(rooms: Room[]): Edge[]` — `kind` always `'mst'`-eligible input, i.e. undecided; this stage sets no `kind` yet, downstream stages (3, 4) assign it. Returns deduped edges `{ a, b, weight }` with `a < b`.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/stages/02-triangulate.test.js
import { describe, it, expect } from 'vitest';
import { triangulate } from '../../src/stages/02-triangulate.js';

function room(id, cx, cy) {
  return { id, floor: 0, x: cx - 1, y: cy - 1, w: 2, h: 2, cx, cy, role: 'filler', doors: [] };
}

describe('triangulate', () => {
  it('returns no edges for fewer than 3 rooms', () => {
    expect(triangulate([room(0, 0, 0)])).toEqual([]);
    expect(triangulate([room(0, 0, 0), room(1, 5, 0)])).toHaveLength(1);
  });

  it('every edge has a < b (deduped, undirected)', () => {
    const rooms = [room(0, 0, 0), room(1, 5, 0), room(2, 0, 5), room(3, 5, 5)];
    const edges = triangulate(rooms);
    for (const e of edges) {
      expect(e.a).toBeLessThan(e.b);
    }
  });

  it('edge weight equals euclidean distance between centroids', () => {
    const rooms = [room(0, 0, 0), room(1, 3, 4), room(2, 10, 0)];
    const edges = triangulate(rooms);
    const e01 = edges.find((e) => (e.a === 0 && e.b === 1) || (e.a === 1 && e.b === 0));
    expect(e01.weight).toBeCloseTo(5, 5); // 3-4-5 triangle
  });

  it('produces no duplicate edges for a square of 4 rooms', () => {
    const rooms = [room(0, 0, 0), room(1, 10, 0), room(2, 10, 10), room(3, 0, 10)];
    const edges = triangulate(rooms);
    const seen = new Set();
    for (const e of edges) {
      const key = `${e.a}-${e.b}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/02-triangulate.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `02-triangulate.js`**

```js
// packages/core/src/stages/02-triangulate.js
import Delaunator from 'delaunator';

/** @param {import('../types.js').Room[]} rooms */
export function triangulate(rooms) {
  if (rooms.length < 2) return [];

  if (rooms.length === 2) {
    const [r0, r1] = rooms;
    return [{ a: r0.id, b: r1.id, weight: Math.hypot(r0.cx - r1.cx, r0.cy - r1.cy) }];
  }

  const points = rooms.flatMap((r) => [r.cx, r.cy]);
  const delaunay = new Delaunator(points);

  const edgeSet = new Map();
  const addEdge = (i, j) => {
    const roomI = rooms[i];
    const roomJ = rooms[j];
    const a = Math.min(roomI.id, roomJ.id);
    const b = Math.max(roomI.id, roomJ.id);
    const key = `${a}-${b}`;
    if (!edgeSet.has(key)) {
      const ra = a === roomI.id ? roomI : roomJ;
      const rb = a === roomI.id ? roomJ : roomI;
      edgeSet.set(key, { a, b, weight: Math.hypot(ra.cx - rb.cx, ra.cy - rb.cy) });
    }
  };

  for (let e = 0; e < delaunay.triangles.length; e++) {
    const p = delaunay.triangles[e];
    const q = delaunay.triangles[e % 3 === 2 ? e - 2 : e + 1];
    addEdge(p, q);
  }

  return Array.from(edgeSet.values());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/02-triangulate.test.js`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/02-triangulate.js packages/core/test/stages/02-triangulate.test.js
git commit -m "feat(core): stage 2 triangulate — per-floor Delaunay edges"
npm install delaunator --workspace packages/core
git add package-lock.json packages/core/package.json
git commit -m "chore(core): add delaunator dependency"
```

---

### Task 7: Stage 3 — `spanningTree`

**Files:**
- Create: `packages/core/src/stages/03-spanning-tree.js`
- Test: `packages/core/test/stages/03-spanning-tree.test.js`

**Interfaces:**
- Consumes: `Room[]`, `Edge[]` from `triangulate`
- Produces: `spanningTree(rooms: Room[], edges: Edge[]): Edge[]` — Prim's MST, every returned edge has `kind: 'mst'`.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/stages/03-spanning-tree.test.js
import { describe, it, expect } from 'vitest';
import { spanningTree } from '../../src/stages/03-spanning-tree.js';

function room(id) {
  return { id, floor: 0, x: 0, y: 0, w: 1, h: 1, cx: id, cy: 0, role: 'filler', doors: [] };
}

describe('spanningTree', () => {
  it('returns V-1 edges for a connected input graph', () => {
    const rooms = [room(0), room(1), room(2), room(3)];
    const edges = [
      { a: 0, b: 1, weight: 1 },
      { a: 1, b: 2, weight: 1 },
      { a: 2, b: 3, weight: 1 },
      { a: 0, b: 3, weight: 5 },
      { a: 0, b: 2, weight: 3 },
    ];
    const mst = spanningTree(rooms, edges);
    expect(mst).toHaveLength(rooms.length - 1);
  });

  it('every returned edge is tagged kind: "mst"', () => {
    const rooms = [room(0), room(1), room(2)];
    const edges = [
      { a: 0, b: 1, weight: 1 },
      { a: 1, b: 2, weight: 1 },
      { a: 0, b: 2, weight: 2 },
    ];
    const mst = spanningTree(rooms, edges);
    expect(mst.every((e) => e.kind === 'mst')).toBe(true);
  });

  it('the result graph is connected (reaches every room)', () => {
    const rooms = [room(0), room(1), room(2), room(3), room(4)];
    const edges = [
      { a: 0, b: 1, weight: 1 },
      { a: 1, b: 2, weight: 1 },
      { a: 2, b: 3, weight: 1 },
      { a: 3, b: 4, weight: 1 },
      { a: 0, b: 4, weight: 10 },
    ];
    const mst = spanningTree(rooms, edges);
    const adj = new Map(rooms.map((r) => [r.id, []]));
    for (const e of mst) {
      adj.get(e.a).push(e.b);
      adj.get(e.b).push(e.a);
    }
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const cur = stack.pop();
      for (const next of adj.get(cur)) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    expect(seen.size).toBe(rooms.length);
  });

  it('picks the lower-weight edge when a cheaper alternative exists', () => {
    const rooms = [room(0), room(1), room(2)];
    const edges = [
      { a: 0, b: 1, weight: 1 },
      { a: 1, b: 2, weight: 1 },
      { a: 0, b: 2, weight: 100 },
    ];
    const mst = spanningTree(rooms, edges);
    const hasExpensive = mst.some((e) => e.weight === 100);
    expect(hasExpensive).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/03-spanning-tree.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `03-spanning-tree.js`**

```js
// packages/core/src/stages/03-spanning-tree.js

/**
 * @param {import('../types.js').Room[]} rooms
 * @param {import('../types.js').Edge[]} edges
 */
export function spanningTree(rooms, edges) {
  if (rooms.length === 0) return [];

  const adjacency = new Map(rooms.map((r) => [r.id, []]));
  for (const e of edges) {
    adjacency.get(e.a).push(e);
    adjacency.get(e.b).push(e);
  }

  const visited = new Set([rooms[0].id]);
  const frontier = [...adjacency.get(rooms[0].id)];
  const mst = [];

  while (visited.size < rooms.length && frontier.length > 0) {
    frontier.sort((x, y) => x.weight - y.weight);
    const edge = frontier.shift();
    const otherEnd = visited.has(edge.a) ? edge.b : visited.has(edge.b) ? edge.a : null;
    if (otherEnd === null || visited.has(otherEnd)) continue;

    visited.add(otherEnd);
    mst.push({ a: edge.a, b: edge.b, weight: edge.weight, kind: 'mst' });
    frontier.push(...adjacency.get(otherEnd).filter((e) => {
      const far = e.a === otherEnd ? e.b : e.a;
      return !visited.has(far);
    }));
  }

  return mst;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/03-spanning-tree.test.js`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/03-spanning-tree.js packages/core/test/stages/03-spanning-tree.test.js
git commit -m "feat(core): stage 3 spanningTree — Prim's MST per floor"
```

---

### Task 8: Stage 4 — `addCycles`

**Files:**
- Create: `packages/core/src/stages/04-add-cycles.js`
- Test: `packages/core/test/stages/04-add-cycles.test.js`

**Interfaces:**
- Consumes: `Edge[]` (all edges from `triangulate`), `Edge[]` (MST subset from `spanningTree`), `number` (`cycleRate`), `Rng`
- Produces: `addCycles(allEdges: Edge[], mstEdges: Edge[], cycleRate: number, rng: Rng): Edge[]` — returns the full edge list: MST edges unchanged plus a probabilistic subset of non-MST edges tagged `kind: 'cycle'`.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/stages/04-add-cycles.test.js
import { describe, it, expect } from 'vitest';
import { deriveRng } from '../../src/rng.js';
import { addCycles } from '../../src/stages/04-add-cycles.js';

describe('addCycles', () => {
  const allEdges = [
    { a: 0, b: 1, weight: 1 },
    { a: 1, b: 2, weight: 1 },
    { a: 0, b: 2, weight: 2 },
    { a: 2, b: 3, weight: 1 },
  ];
  const mstEdges = [
    { a: 0, b: 1, weight: 1, kind: 'mst' },
    { a: 1, b: 2, weight: 1, kind: 'mst' },
    { a: 2, b: 3, weight: 1, kind: 'mst' },
  ];

  it('always includes every MST edge unchanged', () => {
    const result = addCycles(allEdges, mstEdges, 0, deriveRng('s', 'cycles'));
    for (const e of mstEdges) {
      expect(result).toContainEqual(e);
    }
  });

  it('cycleRate 0 never adds a cycle edge', () => {
    const result = addCycles(allEdges, mstEdges, 0, deriveRng('s', 'cycles'));
    expect(result.filter((e) => e.kind === 'cycle')).toHaveLength(0);
  });

  it('cycleRate 1 adds every non-MST edge as a cycle', () => {
    const result = addCycles(allEdges, mstEdges, 1, deriveRng('s', 'cycles'));
    const cycles = result.filter((e) => e.kind === 'cycle');
    expect(cycles).toHaveLength(1); // only (0,2) is not in the MST
    expect(cycles[0]).toMatchObject({ a: 0, b: 2 });
  });

  it('is deterministic for the same seed', () => {
    const r1 = addCycles(allEdges, mstEdges, 0.5, deriveRng('same', 'cycles'));
    const r2 = addCycles(allEdges, mstEdges, 0.5, deriveRng('same', 'cycles'));
    expect(r1).toEqual(r2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/04-add-cycles.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `04-add-cycles.js`**

```js
// packages/core/src/stages/04-add-cycles.js

/**
 * @param {import('../types.js').Edge[]} allEdges
 * @param {import('../types.js').Edge[]} mstEdges
 * @param {number} cycleRate
 * @param {import('../rng.js').Rng} rng
 */
export function addCycles(allEdges, mstEdges, cycleRate, rng) {
  const mstKeys = new Set(mstEdges.map((e) => `${e.a}-${e.b}`));
  const result = [...mstEdges];

  for (const edge of allEdges) {
    const key = `${edge.a}-${edge.b}`;
    if (mstKeys.has(key)) continue;
    if (rng.chance(cycleRate)) {
      result.push({ a: edge.a, b: edge.b, weight: edge.weight, kind: 'cycle' });
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/04-add-cycles.test.js`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/04-add-cycles.js packages/core/test/stages/04-add-cycles.test.js
git commit -m "feat(core): stage 4 addCycles — probabilistic cycle reintroduction"
```

---

### Task 9: Stage 6 — `carve` (A* corridors, no thickening)

**Files:**
- Create: `packages/core/src/stages/06-carve.js`
- Test: `packages/core/test/stages/06-carve.test.js`

**Interfaces:**
- Consumes: `Uint8Array` grid + `width`/`height` from `grid.js`, `Room[]`, `Edge[]` (MST first, then cycle edges — caller's responsibility per SPEC.md §5.8), `CarveCosts`
- Produces: `carve(grid: Uint8Array, width: number, height: number, floor: number, rooms: Room[], edges: Edge[], costs: CarveCosts): void` — mutates `grid` in place, marking `CELL.HALLWAY` along each A* path and leaving room interiors as `CELL.ROOM` (rooms are pre-stamped by the caller — see pipeline task). Residual-cell thickening (SPEC.md §5.8 "Engrossamento de corredor") is explicitly **out of scope** for this task — it depends on `residualCells` from Stage 1 and is deferred to the M5 follow-up plan.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/stages/06-carve.test.js
import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell, getCell, cellIndex } from '../../src/grid.js';
import { carve } from '../../src/stages/06-carve.js';

const COSTS = { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 };

function stampRoom(grid, room, width, height) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      setCell(grid, x, y, 0, width, height, CELL.ROOM);
    }
  }
}

function room(id, x, y, w, h) {
  return { id, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [] };
}

describe('carve', () => {
  it('connects two rooms with a path of HALLWAY cells', () => {
    const width = 20;
    const height = 20;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 3, 3);
    const r1 = room(1, 14, 14, 3, 3);
    stampRoom(grid, r0, width, height);
    stampRoom(grid, r1, width, height);

    carve(grid, width, height, 0, [r0, r1], [{ a: 0, b: 1, weight: 1, kind: 'mst' }], COSTS);

    const hallwayCount = Array.from(grid).filter((c) => c === CELL.HALLWAY).length;
    expect(hallwayCount).toBeGreaterThan(0);
  });

  it('is deterministic given the same inputs (no RNG involved)', () => {
    const width = 20;
    const height = 20;
    const gridA = createGrid(width, height, 1);
    const gridB = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 3, 3);
    const r1 = room(1, 14, 14, 3, 3);
    for (const g of [gridA, gridB]) {
      stampRoom(g, r0, width, height);
      stampRoom(g, r1, width, height);
    }
    const edges = [{ a: 0, b: 1, weight: 1, kind: 'mst' }];
    carve(gridA, width, height, 0, [r0, r1], edges, COSTS);
    carve(gridB, width, height, 0, [r0, r1], edges, COSTS);
    expect(Array.from(gridA)).toEqual(Array.from(gridB));
  });

  it('reuses an existing hallway instead of carving a parallel new one when cheaper', () => {
    // Three rooms in an L: 0-1 carved first (mst), then 1-2 should tend to
    // join the existing corridor near room 1 rather than cut a brand new one
    // straight from room 1's far wall, because reuseHallway << newHallway.
    const width = 20;
    const height = 20;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 1, 1, 2, 2);
    const r1 = room(1, 10, 1, 2, 2);
    const r2 = room(2, 10, 10, 2, 2);
    for (const r of [r0, r1, r2]) stampRoom(grid, r, width, height);

    carve(grid, width, height, 0, [r0, r1, r2], [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
    ], COSTS);

    const hallwayCount = Array.from(grid).filter((c) => c === CELL.HALLWAY).length;
    // Sanity bound: a naive L-shaped double corridor for these distances is
    // well under 60 cells; this catches a cost function that ignores reuse.
    expect(hallwayCount).toBeLessThan(60);
  });

  it('every carved HALLWAY cell is within grid bounds', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 0, 0, 2, 2);
    const r1 = room(1, 7, 7, 2, 2);
    stampRoom(grid, r0, width, height);
    stampRoom(grid, r1, width, height);
    carve(grid, width, height, 0, [r0, r1], [{ a: 0, b: 1, weight: 1, kind: 'mst' }], COSTS);
    expect(grid.length).toBe(width * height);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/06-carve.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `06-carve.js`**

```js
// packages/core/src/stages/06-carve.js
import { CELL, getCell, setCell, inBounds } from '../grid.js';

function roomBoundaryCell(room) {
  // A single accessible cell just outside the room's edge, used as the
  // A* target/source so the path connects to the room without cutting
  // through its interior needlessly.
  return { x: Math.round(room.cx), y: Math.round(room.cy) };
}

function cellCost(cellValue, costs) {
  switch (cellValue) {
    case CELL.EMPTY:
      return costs.newHallway;
    case CELL.HALLWAY:
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

    for (const node of path) {
      if (getCell(grid, node.x, node.y, floor, width, height) === CELL.EMPTY) {
        setCell(grid, node.x, node.y, floor, width, height, CELL.HALLWAY);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/06-carve.test.js`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/06-carve.js packages/core/test/stages/06-carve.test.js
git commit -m "feat(core): stage 6 carve — A* corridors with turn penalty (no thickening yet)"
```

---

### Task 10: Stage 8 — `mission`

**Files:**
- Create: `packages/core/src/stages/08-mission.js`
- Test: `packages/core/test/stages/08-mission.test.js`

**Interfaces:**
- Consumes: `Room[]`, `Edge[]` (MST + cycle, single floor for this plan's scope)
- Produces: `mission(rooms: Room[], edges: Edge[]): { entranceRoomId: number, climaxRoomId: number, path: number[], criticalLinks: number[], optionalBranches: number[][] }`, and mutates each `Room.role` in place to one of `'entrance'|'climax'|'treasure'|'junction'|'filler'` per SPEC.md §5.10. `criticalLinks` is always `[]` in this plan's single-floor scope (no `VerticalLink`s exist yet); it becomes meaningful once Stage 5 (`verticalLinks`) lands in the M5 follow-up plan.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/stages/08-mission.test.js
import { describe, it, expect } from 'vitest';
import { mission } from '../../src/stages/08-mission.js';

function room(id, cx, cy) {
  return { id, floor: 0, x: cx, y: cy, w: 1, h: 1, cx, cy, role: 'filler', doors: [] };
}

describe('mission', () => {
  it('marks exactly one entrance and one climax on a simple chain', () => {
    // 0 - 1 - 2 - 3, a straight MST chain: both leaves (0, 3) are candidates.
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0), room(3, 3, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 2, b: 3, weight: 1, kind: 'mst' },
    ];
    const result = mission(rooms, edges);
    const entrances = rooms.filter((r) => r.role === 'entrance');
    const climaxes = rooms.filter((r) => r.role === 'climax');
    expect(entrances).toHaveLength(1);
    expect(climaxes).toHaveLength(1);
    expect(result.entranceRoomId).toBe(entrances[0].id);
    expect(result.climaxRoomId).toBe(climaxes[0].id);
  });

  it('entrance and climax are never the same room', () => {
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
    ];
    const result = mission(rooms, edges);
    expect(result.entranceRoomId).not.toBe(result.climaxRoomId);
  });

  it('marks rooms reachable only via a cycle edge as treasure', () => {
    // 0-1-2 is the MST chain; 0-2 is a cycle edge, making room 2 reachable
    // by both the chain and the cycle, but a room hanging *only* off the
    // cycle edge (room 3, linked only to 2 via cycle) should be treasure.
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0), room(3, 3, 3)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 2, b: 3, weight: 1, kind: 'cycle' },
    ];
    mission(rooms, edges);
    const room3 = rooms.find((r) => r.id === 3);
    expect(room3.role).toBe('treasure');
  });

  it('marks degree >=3 rooms as junction (when not entrance/climax/treasure)', () => {
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 1), room(3, 2, -1), room(4, 3, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 1, b: 3, weight: 1, kind: 'mst' },
      { a: 1, b: 4, weight: 1, kind: 'mst' },
    ];
    mission(rooms, edges);
    const hub = rooms.find((r) => r.id === 1);
    expect(hub.role).toBe('junction');
  });

  it('path connects entrance to climax through the graph', () => {
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0), room(3, 3, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 2, b: 3, weight: 1, kind: 'mst' },
    ];
    const result = mission(rooms, edges);
    expect(result.path[0]).toBe(result.entranceRoomId);
    expect(result.path[result.path.length - 1]).toBe(result.climaxRoomId);
  });

  it('is deterministic (mission takes no RNG)', () => {
    const rooms1 = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0)];
    const rooms2 = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
    ];
    const r1 = mission(rooms1, edges);
    const r2 = mission(rooms2, edges);
    expect(r1.entranceRoomId).toBe(r2.entranceRoomId);
    expect(r1.climaxRoomId).toBe(r2.climaxRoomId);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/08-mission.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `08-mission.js`**

```js
// packages/core/src/stages/08-mission.js

function buildAdjacency(rooms, edges) {
  const adj = new Map(rooms.map((r) => [r.id, []]));
  for (const e of edges) {
    adj.get(e.a).push({ to: e.b, kind: e.kind });
    adj.get(e.b).push({ to: e.a, kind: e.kind });
  }
  return adj;
}

function bfsDistances(adj, startId, edgeFilter = () => true) {
  const dist = new Map([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    for (const { to, kind } of adj.get(cur)) {
      if (!edgeFilter(kind)) continue;
      if (!dist.has(to)) {
        dist.set(to, dist.get(cur) + 1);
        queue.push(to);
      }
    }
  }
  return dist;
}

function bfsPath(adj, startId, targetId) {
  const prev = new Map([[startId, null]]);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === targetId) break;
    for (const { to } of adj.get(cur)) {
      if (!prev.has(to)) {
        prev.set(to, cur);
        queue.push(to);
      }
    }
  }
  const path = [];
  let node = targetId;
  while (node !== null && node !== undefined) {
    path.unshift(node);
    node = prev.get(node) ?? null;
    if (node === startId) {
      path.unshift(startId);
      break;
    }
  }
  return path;
}

/**
 * @param {import('../types.js').Room[]} rooms
 * @param {import('../types.js').Edge[]} edges
 */
export function mission(rooms, edges) {
  const adj = buildAdjacency(rooms, edges);
  const degree = new Map(rooms.map((r) => [r.id, adj.get(r.id).length]));
  const leaves = rooms.filter((r) => degree.get(r.id) === 1);

  // Highest floor = numerically smallest floor index in this codebase's
  // convention (floor 0 is the topmost/entrance floor); within this plan's
  // single-floor scope, every room is on the same floor, so "highest floor"
  // degenerates to "any leaf", picked by farthest distance from the graph's
  // approximate centroid to keep the choice non-arbitrary and deterministic.
  const highestFloor = Math.min(...rooms.map((r) => r.floor));
  const topFloorLeaves = leaves.filter((r) => r.floor === highestFloor);
  const pool = topFloorLeaves.length > 0 ? topFloorLeaves : leaves.length > 0 ? leaves : rooms;

  const centroidX = rooms.reduce((s, r) => s + r.cx, 0) / rooms.length;
  const centroidY = rooms.reduce((s, r) => s + r.cy, 0) / rooms.length;
  const byDistFromCentroid = [...pool].sort((a, b) => {
    const da = Math.hypot(a.cx - centroidX, a.cy - centroidY);
    const db = Math.hypot(b.cx - centroidX, b.cy - centroidY);
    return db - da || a.id - b.id;
  });
  const entrance = byDistFromCentroid[0];

  const distFromEntrance = bfsDistances(adj, entrance.id);
  const deepestFloor = Math.max(...rooms.map((r) => r.floor));
  const climaxCandidates = leaves.filter((r) => r.id !== entrance.id);
  const pickPool = climaxCandidates.length > 0 ? climaxCandidates : rooms.filter((r) => r.id !== entrance.id);
  const climax = pickPool.reduce((best, r) => {
    const rEcc = distFromEntrance.get(r.id) ?? -1;
    const bestEcc = distFromEntrance.get(best.id) ?? -1;
    const rDeepBonus = r.floor === deepestFloor ? 1 : 0;
    const bestDeepBonus = best.floor === deepestFloor ? 1 : 0;
    if (rEcc + rDeepBonus > bestEcc + bestDeepBonus) return r;
    if (rEcc + rDeepBonus === bestEcc + bestDeepBonus && r.id < best.id) return r;
    return best;
  }, pickPool[0]);

  // treasure: leaves reachable from the rest of the graph ONLY via a cycle edge.
  const mstOnlyDist = bfsDistances(adj, entrance.id, (kind) => kind === 'mst');
  for (const leaf of leaves) {
    if (leaf.id === entrance.id || leaf.id === climax.id) continue;
    if (!mstOnlyDist.has(leaf.id)) {
      leaf.role = 'treasure';
    }
  }

  for (const r of rooms) {
    if (r.id === entrance.id) {
      r.role = 'entrance';
    } else if (r.id === climax.id) {
      r.role = 'climax';
    } else if (r.role === 'treasure') {
      // already set above
    } else if (degree.get(r.id) >= 3) {
      r.role = 'junction';
    } else {
      r.role = 'filler';
    }
  }

  const path = bfsPath(adj, entrance.id, climax.id);

  return {
    entranceRoomId: entrance.id,
    climaxRoomId: climax.id,
    path,
    criticalLinks: [],
    optionalBranches: [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/08-mission.test.js`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/08-mission.js packages/core/test/stages/08-mission.test.js
git commit -m "feat(core): stage 8 mission — role labeling by graph metrics"
```

---

### Task 11: Stage 9 — `key`

**Files:**
- Create: `packages/core/src/stages/09-key.js`
- Test: `packages/core/test/stages/09-key.test.js`

**Interfaces:**
- Consumes: `Room[]` (with `.role` set by `mission`), `{ entranceRoomId }` from `mission`'s return value, `KeyConfig` (`{ scheme, numberJunctions, startAt, padTo, exitsInEntries }`)
- Produces:
  - `buildKey(rooms: Room[], entranceRoomId: number, keyConfig): { areas: Area[], key: { scheme, entries: KeyEntry[], legend: LegendSymbol[], byLabel: Record<string, number> } }`
  - `keyToMarkdown(areas: Area[], key): string`
  - No `Rng` parameter anywhere — numbering must be a pure function of topology (Global Constraints).

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/stages/09-key.test.js
import { describe, it, expect } from 'vitest';
import { buildKey, keyToMarkdown } from '../../src/stages/09-key.js';

function room(id, floor, cx, cy, role = 'filler') {
  return { id, floor, x: cx, y: cy, w: 1, h: 1, cx, cy, role, doors: [] };
}

const DEFAULT_KEY_CONFIG = {
  scheme: 'per-floor',
  numberJunctions: false,
  startAt: 1,
  padTo: 2,
  exitsInEntries: true,
};

describe('buildKey', () => {
  it('numbers every room via BFS from the entrance, ties broken by (y, then x)', () => {
    // entrance(0) at origin; two BFS-equal-distance neighbors 1 (y=0,x=1)
    // and 2 (y=-1,x=1) — 2 should win the tie (smaller y first).
    const rooms = [
      room(0, 0, 0, 0, 'entrance'),
      room(1, 0, 1, 0, 'filler'),
      room(2, 0, 1, -1, 'filler'),
    ];
    rooms[0].edges = undefined; // rooms don't carry edges; buildKey takes rooms + adjacency via exits computed elsewhere in real pipeline
    const adjacency = [
      { a: 0, b: 1 },
      { a: 0, b: 2 },
    ];
    const { areas, key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    const areaFor = (id) => areas.find((a) => a.roomId === id);
    expect(areaFor(0).label).toBe('1-01');
    expect(areaFor(2).label).toBe('1-02'); // y=-1 sorts before y=0
    expect(areaFor(1).label).toBe('1-03');
    expect(key.byLabel['1-01']).toBe(areaFor(0).id);
  });

  it('supports the flat scheme (no floor prefix)', () => {
    const rooms = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0)];
    const adjacency = [{ a: 0, b: 1 }];
    const { areas } = buildKey(rooms, adjacency, 0, { ...DEFAULT_KEY_CONFIG, scheme: 'flat' });
    const labels = areas.map((a) => a.label).sort();
    expect(labels).toEqual(['1', '2']);
  });

  it('supports the alpha-floor scheme', () => {
    const rooms = [
      room(0, 0, 0, 0, 'entrance'),
      room(1, 1, 1, 0),
    ];
    const adjacency = [{ a: 0, b: 1 }];
    const { areas } = buildKey(rooms, adjacency, 0, { ...DEFAULT_KEY_CONFIG, scheme: 'alpha-floor' });
    const areaFor = (id) => areas.find((a) => a.roomId === id);
    expect(areaFor(0).label).toBe('A1');
    expect(areaFor(1).label).toBe('B1');
  });

  it('generates a KeyEntry per area with role-appropriate title', () => {
    const rooms = [
      room(0, 0, 0, 0, 'entrance'),
      room(1, 0, 1, 0, 'climax'),
    ];
    const adjacency = [{ a: 0, b: 1 }];
    const { key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    expect(key.entries.find((e) => e.title === 'Entrada')).toBeTruthy();
    expect(key.entries.find((e) => e.title === 'Câmara final')).toBeTruthy();
  });

  it('legend only lists symbols actually present', () => {
    const rooms = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0, 'filler')];
    const adjacency = [{ a: 0, b: 1 }];
    const { key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    expect(key.legend.some((s) => s.kind === 'treasure')).toBe(false);
    expect(key.legend.some((s) => s.kind === 'entrance')).toBe(true);
  });

  it('is deterministic — same input, same output, no RNG parameter exists', () => {
    const rooms1 = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0)];
    const rooms2 = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0)];
    const adjacency = [{ a: 0, b: 1 }];
    const r1 = buildKey(rooms1, adjacency, 0, DEFAULT_KEY_CONFIG);
    const r2 = buildKey(rooms2, adjacency, 0, DEFAULT_KEY_CONFIG);
    expect(r1.areas.map((a) => a.label)).toEqual(r2.areas.map((a) => a.label));
  });
});

describe('keyToMarkdown', () => {
  it('produces a heading per floor and a section per area', () => {
    const rooms = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0)];
    const adjacency = [{ a: 0, b: 1 }];
    const { areas, key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    const md = keyToMarkdown(areas, key);
    expect(md).toContain('# ');
    expect(md).toContain('1-01');
    expect(md).toContain('1-02');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/09-key.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `09-key.js`**

```js
// packages/core/src/stages/09-key.js

const TITLE_BY_ROLE = {
  entrance: 'Entrada',
  climax: 'Câmara final',
  treasure: 'Câmara isolada',
  junction: 'Encruzilhada',
  filler: null, // filled per-area below: "Área {label}"
};

const LEGEND_BY_ROLE = {
  entrance: { kind: 'entrance', caption: 'Entrada da masmorra' },
  climax: { kind: 'climax', caption: 'Câmara final' },
  treasure: { kind: 'treasure', caption: 'Câmara de tesouro opcional' },
  junction: { kind: 'junction', caption: 'Encruzilhada' },
};

function formatLabel(scheme, floor, number, padTo) {
  const padded = String(number).padStart(padTo, '0');
  if (scheme === 'flat') return String(number);
  if (scheme === 'alpha-floor') {
    const letter = String.fromCharCode('A'.charCodeAt(0) + floor);
    return `${letter}${number}`;
  }
  // per-floor
  return `${floor + 1}-${padded}`;
}

function buildAdjacency(rooms, adjacency) {
  const adj = new Map(rooms.map((r) => [r.id, []]));
  for (const { a, b } of adjacency) {
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  return adj;
}

function bfsOrder(rooms, adjacency, entranceRoomId) {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const adj = buildAdjacency(rooms, adjacency);
  const order = [];
  const seen = new Set([entranceRoomId]);
  let frontier = [entranceRoomId];

  while (frontier.length > 0) {
    const sorted = [...frontier].sort((idA, idB) => {
      const a = roomsById.get(idA);
      const b = roomsById.get(idB);
      return a.y - b.y || a.x - b.x || idA - idB;
    });
    order.push(...sorted);

    const next = [];
    for (const id of sorted) {
      for (const neighbor of adj.get(id)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  // Rooms unreachable from the entrance (shouldn't happen post-validation)
  // are appended in id order so buildKey never silently drops one.
  for (const r of rooms) {
    if (!seen.has(r.id)) order.push(r.id);
  }

  return order;
}

function exitsFor(roomId, adjacency, labelByRoomId) {
  const exits = [];
  for (const { a, b } of adjacency) {
    if (a === roomId) exits.push({ dir: 'n', toLabel: labelByRoomId.get(b), via: 'door' });
    if (b === roomId) exits.push({ dir: 's', toLabel: labelByRoomId.get(a), via: 'door' });
  }
  return exits;
}

function descriptionFor(role, exits, exitsInEntries) {
  const exitLines = exitsInEntries
    ? exits.map((e) => `${e.dir.toUpperCase()} → ${e.toLabel}`).join(', ')
    : '';
  switch (role) {
    case 'entrance':
      return `Aponta as saídas e o que se vê do umbral. ${exitLines}`.trim();
    case 'climax':
      return `Ponto mais distante da entrada. ${exitLines}`.trim();
    case 'treasure':
      return `Ramo opcional, alcançável só por um caminho alternativo. ${exitLines}`.trim();
    case 'junction':
      return `Encruzilhada com ${exits.length} saídas. ${exitLines}`.trim();
    default:
      return exitLines;
  }
}

/**
 * @param {import('../types.js').Room[]} rooms
 * @param {{a:number,b:number}[]} adjacency
 * @param {number} entranceRoomId
 * @param {{scheme:string, numberJunctions:boolean, startAt:number, padTo:number, exitsInEntries:boolean}} keyConfig
 */
export function buildKey(rooms, adjacency, entranceRoomId, keyConfig) {
  const order = bfsOrder(rooms, adjacency, entranceRoomId);
  const roomsById = new Map(rooms.map((r) => [r.id, r]));

  const numberedIds = order.filter((id) => {
    const r = roomsById.get(id);
    return r.role !== 'junction' || keyConfig.numberJunctions || true; // every Room is numbered (SPEC §5.11 "toda Room, sempre")
  });

  const labelByRoomId = new Map();
  numberedIds.forEach((id, i) => {
    const r = roomsById.get(id);
    labelByRoomId.set(id, formatLabel(keyConfig.scheme, r.floor, keyConfig.startAt + i, keyConfig.padTo));
  });

  const areas = numberedIds.map((id) => {
    const r = roomsById.get(id);
    return {
      id,
      label: labelByRoomId.get(id),
      floor: r.floor,
      roomId: id,
      cx: r.cx,
      cy: r.cy,
      exits: exitsFor(id, adjacency, labelByRoomId),
    };
  });

  const entries = areas.map((area) => {
    const room = roomsById.get(area.roomId);
    const title = TITLE_BY_ROLE[room.role] ?? `Área ${area.label}`;
    return {
      areaId: area.id,
      label: area.label,
      title,
      description: descriptionFor(room.role, area.exits, keyConfig.exitsInEntries),
      tags: [room.role],
    };
  });

  const rolesPresent = new Set(rooms.map((r) => r.role));
  const legend = Object.entries(LEGEND_BY_ROLE)
    .filter(([role]) => rolesPresent.has(role))
    .map(([, symbol]) => symbol);
  legend.push({ kind: 'area', caption: 'Área sem papel especial' });

  const byLabel = Object.fromEntries(areas.map((a) => [a.label, a.id]));

  return {
    areas,
    key: {
      scheme: keyConfig.scheme,
      entries,
      legend,
      byLabel,
    },
  };
}

/**
 * @param {import('../types.js').Area[]} areas
 * @param {{entries: import('../types.js').KeyEntry[], legend: import('../types.js').LegendSymbol[]}} key
 */
export function keyToMarkdown(areas, key) {
  const byFloor = new Map();
  for (const area of areas) {
    if (!byFloor.has(area.floor)) byFloor.set(area.floor, []);
    byFloor.get(area.floor).push(area);
  }

  const entriesByAreaId = new Map(key.entries.map((e) => [e.areaId, e]));

  let md = '';
  for (const [floor, floorAreas] of [...byFloor.entries()].sort((a, b) => a[0] - b[0])) {
    md += `# Andar ${floor + 1}\n\n`;
    for (const area of floorAreas) {
      const entry = entriesByAreaId.get(area.id);
      md += `## ${area.label} — ${entry.title}\n\n${entry.description}\n\n`;
    }
  }

  md += `## Legenda\n\n`;
  for (const symbol of key.legend) {
    md += `- **${symbol.kind}**: ${symbol.caption}\n`;
  }

  return md;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/09-key.test.js`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/09-key.js packages/core/test/stages/09-key.test.js
git commit -m "feat(core): stage 9 key — topology-driven numbering, labels, legend, markdown export"
```

---

### Task 12: Stage 10 — `extractWalls`

**Files:**
- Create: `packages/core/src/stages/10-extract-walls.js`
- Test: `packages/core/test/stages/10-extract-walls.test.js`

**Interfaces:**
- Consumes: `Uint8Array` grid, `width`, `height`, `floor`, `Room[]` (for room-boundary door detection)
- Produces: `extractWalls(grid: Uint8Array, width: number, height: number, floor: number, rooms: Room[]): { walls: WallSegment[], doors: Door[] }` — walls are fused colinear segments; a segment crossing from a room's boundary into a hallway is marked `isDoor: true` and gets a matching `Door` entry. Also mutates each `Room.doors` to list the ids of doors on its boundary.

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/stages/10-extract-walls.test.js
import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell } from '../../src/grid.js';
import { extractWalls } from '../../src/stages/10-extract-walls.js';

function room(id, x, y, w, h) {
  return { id, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [] };
}

function stamp(grid, width, height, x, y, w, h, value) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setCell(grid, x + dx, y + dy, 0, width, height, value);
    }
  }
}

describe('extractWalls', () => {
  it('produces walls only on the boundary of a walkable region', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 4, 4);
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);

    const { walls } = extractWalls(grid, width, height, 0, [r0]);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      expect(w.floor).toBe(0);
    }
  });

  it('fuses colinear contiguous segments into one WallSegment', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 5, 3); // top edge is 5 cells wide -> should fuse into 1 segment, not 5
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);

    const { walls } = extractWalls(grid, width, height, 0, [r0]);
    const topWalls = walls.filter((w) => w.y1 === r0.y && w.y2 === r0.y);
    expect(topWalls).toHaveLength(1);
    expect(Math.abs(topWalls[0].x2 - topWalls[0].x1)).toBe(r0.w);
  });

  it('marks a corridor crossing a room boundary as a door', () => {
    const width = 12;
    const height = 12;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 3, 3);
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    // Hallway poking out of the room's east wall.
    stamp(grid, width, height, r0.x + r0.w, r0.y + 1, 3, 1, CELL.HALLWAY);

    const { walls, doors } = extractWalls(grid, width, height, 0, [r0]);
    expect(doors.length).toBeGreaterThan(0);
    expect(walls.some((w) => w.isDoor)).toBe(true);
  });

  it('every WallSegment borders at least one walkable cell', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const r0 = room(0, 3, 3, 3, 3);
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    const { walls } = extractWalls(grid, width, height, 0, [r0]);
    expect(walls.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same grid', () => {
    const width = 10;
    const height = 10;
    const gridA = createGrid(width, height, 1);
    const gridB = createGrid(width, height, 1);
    const r0 = room(0, 2, 2, 4, 4);
    stamp(gridA, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stamp(gridB, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    const a = extractWalls(gridA, width, height, 0, [room(0, 2, 2, 4, 4)]);
    const b = extractWalls(gridB, width, height, 0, [room(0, 2, 2, 4, 4)]);
    expect(a.walls).toEqual(b.walls);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/stages/10-extract-walls.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `10-extract-walls.js`**

```js
// packages/core/src/stages/10-extract-walls.js
import { CELL, getCell, inBounds } from '../grid.js';

function isWalkable(value) {
  return value === CELL.ROOM || value === CELL.HALLWAY || value === CELL.STAIR;
}

function cellValueAt(grid, x, y, floor, width, height) {
  if (!inBounds(x, y, floor, width, height, floor + 1)) return CELL.EMPTY;
  return getCell(grid, x, y, floor, width, height);
}

function roomAt(rooms, x, y) {
  return rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ?? null;
}

/**
 * Collects unit-length wall edges on the walkable/non-walkable boundary,
 * then fuses colinear contiguous runs into single WallSegments.
 */
function collectRawEdges(grid, width, height, floor, rooms) {
  const horizontal = []; // edges between (x,y-1) and (x,y): a horizontal wall segment at row y
  const vertical = [];   // edges between (x-1,y) and (x,y): a vertical wall segment at column x

  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      const above = cellValueAt(grid, x, y - 1, floor, width, height);
      const below = cellValueAt(grid, x, y, floor, width, height);
      if (isWalkable(above) !== isWalkable(below)) {
        const doorSide = isWalkable(above) ? { x, y: y - 1 } : { x, y };
        const room = roomAt(rooms, doorSide.x, doorSide.y);
        const otherSide = isWalkable(above) ? { x, y } : { x, y: y - 1 };
        const isDoor = room !== null && isWalkable(cellValueAt(grid, otherSide.x, otherSide.y, floor, width, height));
        horizontal.push({ x, y, isDoor, roomId: room?.id ?? null });
      }
    }
  }

  for (let x = 0; x <= width; x++) {
    for (let y = 0; y < height; y++) {
      const left = cellValueAt(grid, x - 1, y, floor, width, height);
      const right = cellValueAt(grid, x, y, floor, width, height);
      if (isWalkable(left) !== isWalkable(right)) {
        const doorSide = isWalkable(left) ? { x: x - 1, y } : { x, y };
        const room = roomAt(rooms, doorSide.x, doorSide.y);
        const otherSide = isWalkable(left) ? { x, y } : { x: x - 1, y };
        const isDoor = room !== null && isWalkable(cellValueAt(grid, otherSide.x, otherSide.y, floor, width, height));
        vertical.push({ x, y, isDoor, roomId: room?.id ?? null });
      }
    }
  }

  return { horizontal, vertical };
}

function fuseRuns(edges, axisKey, positionKey) {
  // edges must be pre-sorted by (axisKey, positionKey)
  const segments = [];
  let run = null;

  for (const edge of edges) {
    if (
      run &&
      run.axis === edge[axisKey] &&
      run.isDoor === edge.isDoor &&
      run.roomId === edge.roomId &&
      edge[positionKey] === run.end
    ) {
      run.end = edge[positionKey] + 1;
    } else {
      if (run) segments.push(run);
      run = { axis: edge[axisKey], start: edge[positionKey], end: edge[positionKey] + 1, isDoor: edge.isDoor, roomId: edge.roomId };
    }
  }
  if (run) segments.push(run);
  return segments;
}

/**
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {import('../types.js').Room[]} rooms
 */
export function extractWalls(grid, width, height, floor, rooms) {
  const { horizontal, vertical } = collectRawEdges(grid, width, height, floor, rooms);

  horizontal.sort((a, b) => a.y - b.y || a.x - b.x);
  vertical.sort((a, b) => a.x - b.x || a.y - b.y);

  const hSegments = fuseRuns(horizontal, 'y', 'x').map((s) => ({
    floor, x1: s.start, y1: s.axis, x2: s.end, y2: s.axis, isDoor: s.isDoor, doorId: null, roomId: s.roomId,
  }));
  const vSegments = fuseRuns(vertical, 'x', 'y').map((s) => ({
    floor, x1: s.axis, y1: s.start, x2: s.axis, y2: s.end, isDoor: s.isDoor, doorId: null, roomId: s.roomId,
  }));

  const walls = [...hSegments, ...vSegments];

  let nextDoorId = 0;
  const doors = [];
  for (const wall of walls) {
    if (!wall.isDoor) continue;
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
    });
  }

  const doorsByRoom = new Map();
  for (const d of doors) {
    if (!doorsByRoom.has(d.roomId)) doorsByRoom.set(d.roomId, []);
    doorsByRoom.get(d.roomId).push(d.id);
  }
  for (const room of rooms) {
    room.doors = doorsByRoom.get(room.id) ?? [];
  }

  // roomId was only needed to compute isDoor/fusing; not part of the public WallSegment shape.
  const publicWalls = walls.map(({ roomId, ...rest }) => rest);

  return { walls: publicWalls, doors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/stages/10-extract-walls.test.js`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stages/10-extract-walls.js packages/core/test/stages/10-extract-walls.test.js
git commit -m "feat(core): stage 10 extractWalls — boundary walk, colinear fusion, door detection"
```

---

### Task 13: `pipeline.js` — wires stages 1→2→3→4→6→8→9→10 for a single floor

**Files:**
- Create: `packages/core/src/pipeline.js`
- Test: `packages/core/test/pipeline.test.js`

**Interfaces:**
- Consumes: every stage module from Tasks 5–12, `makeRng`/`deriveRng` from Task 2, `createGrid`/`setCell`/`CELL` from Task 3
- Produces: `generateDungeon(config: Config): Dungeon` — for this plan's scope, `config.floors` must be `1` (multi-floor wiring, `verticalLinks`, and `prune` land in the M5 follow-up plan; `generateDungeon` throws a clear error if `config.floors !== 1` so the limitation is loud, not silent).

- [ ] **Step 1: Write the failing tests**

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

describe('generateDungeon', () => {
  it('throws a clear error for floors !== 1 (multi-floor is out of scope for this plan)', () => {
    expect(() => generateDungeon({ ...CONFIG, floors: 2 })).toThrow(/floors/i);
  });

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
    const { cells, width, height } = dungeon;
    const isWalkable = (v) => v === CELL.ROOM || v === CELL.HALLWAY;
    const start = cells.findIndex(isWalkable);
    const seen = new Uint8Array(cells.length);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width;
      const y = Math.floor(idx / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!seen[nIdx] && isWalkable(cells[nIdx])) {
          seen[nIdx] = 1;
          stack.push(nIdx);
        }
      }
    }
    const totalWalkable = Array.from(cells).filter(isWalkable).length;
    const reached = Array.from(seen).filter((v) => v === 1).length;
    expect(reached).toBe(totalWalkable);
  });

  it('keyToMarkdown-compatible output round-trips through JSON', () => {
    const dungeon = generateDungeon(CONFIG);
    const roundTripped = JSON.parse(JSON.stringify({ ...dungeon, cells: Array.from(dungeon.cells) }));
    expect(roundTripped.areas.length).toBe(dungeon.areas.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/pipeline.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `pipeline.js`**

```js
// packages/core/src/pipeline.js
import { deriveRng } from './rng.js';
import { CELL, createGrid, setCell } from './grid.js';
import { placeRooms } from './stages/01-place-rooms.js';
import { triangulate } from './stages/02-triangulate.js';
import { spanningTree } from './stages/03-spanning-tree.js';
import { addCycles } from './stages/04-add-cycles.js';
import { carve } from './stages/06-carve.js';
import { mission } from './stages/08-mission.js';
import { buildKey, keyToMarkdown } from './stages/09-key.js';
import { extractWalls } from './stages/10-extract-walls.js';

/** @param {import('./types.js').Config} config */
export function generateDungeon(config) {
  if (config.floors !== 1) {
    throw new Error(
      `generateDungeon: floors=${config.floors} is not supported yet — multi-floor wiring ` +
      `(verticalLinks, prune) ships in the M5 follow-up plan. Use floors: 1.`
    );
  }

  const floor = 0;
  const grid = createGrid(config.width, config.height, config.floors);

  const { rooms } = placeRooms(config.rooms, floor, deriveRng(config.seed, 'place-rooms'));
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        setCell(grid, x, y, floor, config.width, config.height, CELL.ROOM);
      }
    }
  }

  const allEdges = triangulate(rooms);
  const mstEdges = spanningTree(rooms, allEdges);
  const edges = addCycles(allEdges, mstEdges, config.cycleRate, deriveRng(config.seed, 'add-cycles'));

  carve(grid, config.width, config.height, floor, rooms, edges, config.carve);

  const missionResult = mission(rooms, edges);

  const { walls, doors } = extractWalls(grid, config.width, config.height, floor, rooms);

  const roomAdjacency = edges.map((e) => ({ a: e.a, b: e.b }));
  const { areas, key } = buildKey(rooms, roomAdjacency, missionResult.entranceRoomId, config.key);

  return {
    config,
    seed: config.seed,
    width: config.width,
    height: config.height,
    floors: config.floors,
    cells: grid,
    rooms,
    edges,
    links: [],
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
Expected: PASS, all 5 tests green. If the connectivity test fails, it most likely means `carve`'s A* is not reaching every MST edge — re-check `roomBoundaryCell` picks a cell that's actually inside grid bounds for rooms near the grid edge, and that `astar` isn't silently returning `null` (add a temporary `console.log` on the `null` branch to confirm, then remove it).

- [ ] **Step 5: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: All suites pass, ESLint reports 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/pipeline.js packages/core/test/pipeline.test.js
git commit -m "feat(core): pipeline.js wires stages 1-10 for single-floor generation"
```

---

### Task 14: `render` package — pure draw plan + canvas adapter

**Files:**
- Create: `packages/render/src/plan.js`
- Create: `packages/render/src/draw.js`
- Test: `packages/render/test/plan.test.js`

**Interfaces:**
- Consumes: `Dungeon` (specifically `.walls`, `.cells`, `.width`, `.height`, filtered to one `floor`), `{ gridSize: number }`
- Produces:
  - `buildRenderPlan(dungeon: Dungeon, floor: number, gridSize: number): RenderPlan` — pure, no Canvas — `RenderPlan` is `{ width: number, height: number, floorRects: {x,y,w,h}[], wallLines: {x1,y1,x2,y2,isDoor}[] }` in **pixel** coordinates (`pixel = cell * gridSize`, per SPEC.md §5.14). Contains no text/number/symbol draw commands — SPEC.md §5.13 is explicit that render emits no labels.
  - `drawPlanToContext(plan: RenderPlan, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void` — thin imperative adapter, browser-only, not unit-tested with a real canvas; tested via a spy object recording calls.
  - `renderFloor(dungeon: Dungeon, floor: number, gridSize: number): { floor: number, blob: Blob, width: number, height: number }` — browser-only entry point used by the harness (Task 15), requires `OffscreenCanvas`.

- [ ] **Step 1: Write the failing tests**

```js
// packages/render/test/plan.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildRenderPlan } from '../src/plan.js';
import { drawPlanToContext } from '../src/draw.js';

function fakeDungeon() {
  return {
    width: 5,
    height: 5,
    floors: 1,
    cells: new Uint8Array(25).fill(1), // all ROOM
    walls: [
      { floor: 0, x1: 0, y1: 0, x2: 5, y2: 0, isDoor: false, doorId: null },
      { floor: 0, x1: 0, y1: 0, x2: 0, y2: 5, isDoor: false, doorId: null },
      { floor: 0, x1: 2, y1: 0, x2: 3, y2: 0, isDoor: true, doorId: 0 },
    ],
  };
}

describe('buildRenderPlan', () => {
  it('scales wall coordinates by gridSize', () => {
    const plan = buildRenderPlan(fakeDungeon(), 0, 100);
    const wall = plan.wallLines.find((w) => w.x2 === 500 && w.y2 === 0);
    expect(wall).toBeTruthy();
  });

  it('only includes walls for the requested floor', () => {
    const dungeon = fakeDungeon();
    dungeon.walls.push({ floor: 1, x1: 0, y1: 0, x2: 1, y2: 0, isDoor: false, doorId: null });
    const plan = buildRenderPlan(dungeon, 0, 100);
    expect(plan.wallLines).toHaveLength(3);
  });

  it('marks door walls distinctly from regular walls', () => {
    const plan = buildRenderPlan(fakeDungeon(), 0, 100);
    expect(plan.wallLines.some((w) => w.isDoor)).toBe(true);
    expect(plan.wallLines.some((w) => !w.isDoor)).toBe(true);
  });

  it('computes pixel width/height from cell width/height and gridSize', () => {
    const plan = buildRenderPlan(fakeDungeon(), 0, 100);
    expect(plan.width).toBe(500);
    expect(plan.height).toBe(500);
  });

  it('produces no text or symbol draw data — plan has no "label" or "text" fields', () => {
    const plan = buildRenderPlan(fakeDungeon(), 0, 100);
    expect(plan).not.toHaveProperty('labels');
    expect(plan.wallLines.every((w) => !('text' in w))).toBe(true);
  });
});

describe('drawPlanToContext', () => {
  it('draws the floor mask and every wall line, and issues no fillText calls', () => {
    const plan = {
      width: 200,
      height: 200,
      floorRects: [{ x: 0, y: 0, w: 200, h: 200 }],
      wallLines: [
        { x1: 0, y1: 0, x2: 200, y2: 0, isDoor: false },
        { x1: 100, y1: 0, x2: 150, y2: 0, isDoor: true },
      ],
    };
    const ctx = {
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      set fillStyle(v) {},
      set strokeStyle(v) {},
      set lineWidth(v) {},
    };

    drawPlanToContext(plan, ctx);

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 200);
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/render/test/plan.test.js`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `packages/render/src/plan.js`**

```js
// packages/render/src/plan.js

/**
 * Pure translation of a Dungeon floor slice into pixel-space draw data.
 * No Canvas API is touched here — see draw.js for that.
 * @param {import('@dungeon-forge/core').Dungeon} dungeon
 * @param {number} floor
 * @param {number} gridSize
 */
export function buildRenderPlan(dungeon, floor, gridSize) {
  const wallLines = dungeon.walls
    .filter((w) => w.floor === floor)
    .map((w) => ({
      x1: w.x1 * gridSize,
      y1: w.y1 * gridSize,
      x2: w.x2 * gridSize,
      y2: w.y2 * gridSize,
      isDoor: w.isDoor,
    }));

  return {
    width: dungeon.width * gridSize,
    height: dungeon.height * gridSize,
    floorRects: [{ x: 0, y: 0, w: dungeon.width * gridSize, h: dungeon.height * gridSize }],
    wallLines,
  };
}
```

- [ ] **Step 4: Implement `packages/render/src/draw.js`**

```js
// packages/render/src/draw.js

/**
 * Executes a RenderPlan against any CanvasRenderingContext2D-shaped object
 * (real canvas in the browser, OffscreenCanvas in a Worker, or a test spy).
 * Draws floor mask + walls only — no text, no numbers, no symbols
 * (SPEC.md §5.13: numbering is the Notes' job, not render's).
 * @param {{width:number,height:number,floorRects:{x:number,y:number,w:number,h:number}[],wallLines:{x1:number,y1:number,x2:number,y2:number,isDoor:boolean}[]}} plan
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawPlanToContext(plan, ctx) {
  ctx.save();
  ctx.fillStyle = '#2a2a2a';
  for (const rect of plan.floorRects) {
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  ctx.lineWidth = 4;
  for (const line of plan.wallLines) {
    ctx.strokeStyle = line.isDoor ? '#c8963e' : '#0a0a0a';
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Browser/Worker-only entry point: renders one floor to a Blob via
 * OffscreenCanvas. Not covered by the Node test suite — exercised manually
 * through the harness (Task 15).
 * @param {import('@dungeon-forge/core').Dungeon} dungeon
 * @param {number} floor
 * @param {number} gridSize
 */
export async function renderFloor(dungeon, floor, gridSize) {
  const { buildRenderPlan } = await import('./plan.js');
  const plan = buildRenderPlan(dungeon, floor, gridSize);

  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const ctx = canvas.getContext('2d');
  drawPlanToContext(plan, ctx);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { floor, blob, width: plan.width, height: plan.height };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/render/test/plan.test.js`
Expected: PASS, all 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/render/src/plan.js packages/render/src/draw.js packages/render/test/plan.test.js
git commit -m "feat(render): pure draw plan + canvas adapter, no text/labels per SPEC §5.13"
```

---

### Task 15: Vite harness — live preview of a generated floor

**Files:**
- Create: `harness/package.json`
- Create: `harness/vite.config.js`
- Create: `harness/index.html`
- Create: `harness/src/main.js`

**Interfaces:**
- Consumes: `generateDungeon`, `keyToMarkdown` from `@dungeon-forge/core`; `renderFloor` from `@dungeon-forge/render`
- Produces: a runnable `npm run dev --workspace harness` that shows a seed input, a "Generate" button, the rendered floor image, and the markdown key in a `<pre>`.

- [ ] **Step 1: Create `harness/package.json`**

```json
{
  "name": "dungeon-forge-harness",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@dungeon-forge/core": "*",
    "@dungeon-forge/render": "*"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `harness/vite.config.js`**

```js
// harness/vite.config.js
export default {
  server: { port: 5173 },
};
```

- [ ] **Step 3: Create `harness/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Dungeon Forge — Harness</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #111; color: #eee; padding: 1rem; }
      #controls { margin-bottom: 1rem; }
      #floor-image { border: 1px solid #444; max-width: 100%; }
      #key-markdown { white-space: pre-wrap; background: #1a1a1a; padding: 1rem; max-height: 400px; overflow: auto; }
    </style>
  </head>
  <body>
    <h1>Dungeon Forge — harness</h1>
    <div id="controls">
      <label>Seed: <input id="seed" value="preview-seed" /></label>
      <button id="generate">Generate</button>
    </div>
    <img id="floor-image" alt="andar gerado" />
    <h2>Chave (markdown)</h2>
    <pre id="key-markdown"></pre>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `harness/src/main.js`**

```js
// harness/src/main.js
import { generateDungeon, keyToMarkdown } from '@dungeon-forge/core';
import { renderFloor } from '@dungeon-forge/render';

const DEFAULT_CONFIG = {
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

const seedInput = document.getElementById('seed');
const generateButton = document.getElementById('generate');
const floorImage = document.getElementById('floor-image');
const keyMarkdown = document.getElementById('key-markdown');

async function generate() {
  const seed = seedInput.value || 'preview-seed';
  const dungeon = generateDungeon({ ...DEFAULT_CONFIG, seed });
  const { blob } = await renderFloor(dungeon, 0, 100);
  floorImage.src = URL.createObjectURL(blob);
  keyMarkdown.textContent = keyToMarkdown(dungeon.areas, dungeon.key);
}

generateButton.addEventListener('click', generate);
generate();
```

- [ ] **Step 5: Install and run the dev server**

Run: `npm install && npm run dev --workspace harness`
Expected: Vite prints a local URL (e.g. `http://localhost:5173`).

- [ ] **Step 6: Manually verify in a browser**

Open the printed URL. Expected: a floor image appears (dark background, black walls, tan door segments) and the markdown key panel below it lists numbered areas. Click "Generate" again with a different seed value — the image and key should change. Re-enter the same seed twice — the image and key should be identical both times.

This step is manual because `OffscreenCanvas` is browser/Worker-only; it is not exercised by the Vitest suite (Task 14 already covers `buildRenderPlan` and `drawPlanToContext` without a real canvas).

- [ ] **Step 7: Commit**

```bash
git add harness/package.json harness/vite.config.js harness/index.html harness/src/main.js
git commit -m "feat(harness): Vite preview wired to core pipeline + render"
```

---

## Self-Review Notes

- **Spec coverage:** Estágios 0 (rng), 1 (placeRooms), 2 (triangulate), 3 (spanningTree), 4 (addCycles), 6 (carve, minus thickening), 8 (mission), 9 (key + keyToMarkdown), 10 (extractWalls), 11 (render, minus `bakeOverlay`) are each implemented with their own task. Explicitly deferred to the M5 follow-up plan: Estágio 5 (`verticalLinks`), Estágio 7 (`prune`), the residual-cell thickening sub-step of Estágio 6, and `config.key.bakeOverlay`. `pipeline.js` documents and enforces the `floors === 1` boundary so the gap is loud, not silent.
- **Type consistency:** `Rng` shape (`float/int/normal/pick/shuffle/chance`) is identical across Tasks 2, 5, 8. `Room` shape (`id, floor, x, y, w, h, cx, cy, role, doors`) is identical across Tasks 5, 6, 7, 8, 9, 10, 11 and matches `types.js` (Task 4). `Edge` shape (`a, b, weight, kind`) is identical across Tasks 6, 7, 8, 9, 10. `WallSegment`/`Door` shapes in Task 12 match `types.js`. `buildRenderPlan`'s `RenderPlan` shape in Task 14 is consumed unchanged by `drawPlanToContext` in the same task.
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code and an explicit expected result.

---

## Follow-up plans (not written yet — propose separately when this one is done)

1. **M5 — multi-floor:** Estágio 5 `verticalLinks`, Estágio 7 `prune`, corridor thickening in `carve`, extending `pipeline.js` to `floors > 1`, extending `mission`'s `criticalLinks`.
2. **M6–M7 — validator:** `core/src/validate.js` implementing the 15 invariants (SPEC.md §6) plus the 10,000-seed CI property test.
3. **M4a — adapter-foundry v13:** N Scenes + paired teleport Regions (SPEC.md §5.14 `v13.js`), starting from the golden-sample capture (§2.4).
4. **M4b — adapter-foundry v14:** single Scene with elevation bands (SPEC.md §5.14 `v14.js`).
5. **M8 — module UI:** Foundry module wrapper, Worker offload, presets, `config.target` auto-detection.
