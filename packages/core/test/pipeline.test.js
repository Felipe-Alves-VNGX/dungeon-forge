// packages/core/test/pipeline.test.js
import { describe, it, expect } from 'vitest';
import { generateDungeon } from '../src/pipeline.js';
import { validateDungeon } from '../src/validate.js';
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

describe('generateDungeon — multi-floor (M5)', () => {
  const MULTI_CONFIG = { ...CONFIG, seed: 'plan-m5-multi', floors: 3 };

  it('produces at least one VerticalLink per floor gap and globally unique room ids', () => {
    const dungeon = generateDungeon(MULTI_CONFIG);
    expect(dungeon.links.length).toBeGreaterThanOrEqual(MULTI_CONFIG.floors - 1);

    const ids = dungeon.rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every floor has a link up (except the top) and a link down (except the bottom)', () => {
    const dungeon = generateDungeon(MULTI_CONFIG);
    for (let floor = 0; floor < MULTI_CONFIG.floors; floor++) {
      const hasDown = dungeon.links.some((l) => l.fromFloor === floor);
      const hasUp = dungeon.links.some((l) => l.toFloor === floor);
      if (floor < MULTI_CONFIG.floors - 1) expect(hasDown).toBe(true);
      if (floor > 0) expect(hasUp).toBe(true);
    }
  });

  it('the whole multi-floor dungeon is one connected 3D component', () => {
    const dungeon = generateDungeon(MULTI_CONFIG);
    const { cells, width, height, floors } = dungeon;
    const isWalkable = (v) => v === CELL.ROOM || v === CELL.HALLWAY || v === CELL.STAIR;
    const idx3 = (x, y, z) => z * (width * height) + y * width + x;

    const start = cells.findIndex(isWalkable);
    const seen = new Uint8Array(cells.length);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const z = Math.floor(i / (width * height));
      const rem = i % (width * height);
      const y = Math.floor(rem / width);
      const x = rem % width;

      const neighbors = [
        [x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z],
      ];
      // Vertical movement only through a stacked STAIR footprint (same x,y).
      if (cells[i] === CELL.STAIR) {
        if (z + 1 < floors) neighbors.push([x, y, z + 1]);
        if (z - 1 >= 0) neighbors.push([x, y, z - 1]);
      }

      for (const [nx, ny, nz] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || nz < 0 || nz >= floors) continue;
        const nIdx = idx3(nx, ny, nz);
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

  it('is bit-for-bit deterministic across two runs with the same seed', () => {
    const a = generateDungeon(MULTI_CONFIG);
    const b = generateDungeon(MULTI_CONFIG);
    const serialize = (d) => JSON.stringify({ ...d, cells: Array.from(d.cells) });
    expect(serialize(a)).toEqual(serialize(b));
  });
});

describe('generateDungeon — validator regressions (M7)', () => {
  const MULTI_CONFIG = { ...CONFIG, floors: 3 };

  // These two seeds used to produce a Room with zero doors under this exact
  // config: the boundary clamp in pipeline.js pushed two rooms flush against
  // each other (zero gap), so carve()'s A* between their centroids walked
  // straight through ROOM cells the whole way — nothing EMPTY to convert to
  // HALLWAY — and extractWalls never finds a door without one. Fixed by
  // separateClampedRooms() restoring stage 1's >=1-cell-gap invariant after
  // the clamp.
  it('does not orphan a room when the boundary clamp would have left two rooms touching (seed-4)', () => {
    const dungeon = generateDungeon({ ...MULTI_CONFIG, seed: 'seed-4' });
    const { ok, errors } = validateDungeon(dungeon);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  // This seed used to trip 'link-inaccessible': two VerticalLinks from
  // adjacent floor gaps landed with STAIR footprints immediately next to
  // each other on their shared floor (stage 5 only enforces separation
  // within one gap, not across gaps) — a real, legitimate layout, but one
  // that also used to expose a validator bug (see validate.test.js) where
  // a STAIR-only neighbor wasn't counted as "accessible".
  it('accepts two VerticalLinks whose STAIR footprints land adjacent to each other (seed-23)', () => {
    const dungeon = generateDungeon({ ...MULTI_CONFIG, seed: 'seed-23' });
    const { ok, errors } = validateDungeon(dungeon);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });
});
