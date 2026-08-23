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
