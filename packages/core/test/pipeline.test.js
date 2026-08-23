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

// Builds the set of (x, y, fromFloor, toFloor) cell pairs where a vertical
// z-transition is legitimately allowed — i.e. cells that are actually part
// of a VerticalLink footprint. A blanket "any z+/-1 at the same (x,y)" rule
// is over-permissive: floors are carved from independent RNG substreams, so
// walkable areas on adjacent floors coincidentally overlap in (x,y) often
// enough to mask a fully broken stair-carving mechanism (false positives
// observed in ~3/8 sampled seeds at higher room counts). Restricting to
// real link footprints makes this test actually exercise VerticalLink
// carving instead of coincidental (x,y) overlap.
function verticalTransitionKeys(links) {
  const keys = new Set();
  for (const link of links) {
    for (let dy = 0; dy < link.h; dy++) {
      for (let dx = 0; dx < link.w; dx++) {
        const x = link.x + dx;
        const y = link.y + dy;
        keys.add(`${x},${y},${link.fromFloor},${link.toFloor}`);
        keys.add(`${x},${y},${link.toFloor},${link.fromFloor}`);
      }
    }
  }
  return keys;
}

function floodFillWalkable(cells, width, height, floors, links = []) {
  const size = width * height;
  const start = cells.findIndex(isWalkable);
  const seen = new Uint8Array(cells.length);
  const verticalKeys = verticalTransitionKeys(links);
  seen[start] = 1;
  const stack = [start];
  while (stack.length) {
    const idx = stack.pop();
    const z = Math.floor(idx / size);
    const rem = idx % size;
    const y = Math.floor(rem / width);
    const x = rem % width;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || nz < 0 || nz >= floors) continue;
      if (dz !== 0 && !verticalKeys.has(`${x},${y},${z},${nz}`)) continue;
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
    const seen = floodFillWalkable(dungeon.cells, dungeon.width, dungeon.height, dungeon.floors, dungeon.links);
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
