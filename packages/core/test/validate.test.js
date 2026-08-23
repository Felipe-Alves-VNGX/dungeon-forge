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

  it('flags an unreachable walkable cell on a floor (floor connectivity)', () => {
    const dungeon = generateDungeon(CONFIG);
    const brokenCells = dungeon.cells.slice();
    const isWalkableCell = (v) => v === CELL.ROOM || v === CELL.HALLWAY || v === CELL.STAIR;
    // Picking the first EMPTY cell isn't safe: it can sit right next to a
    // walkable cell, in which case turning it into a HALLWAY just extends the
    // connected region instead of creating an unreachable one. Require the
    // cell to have zero walkable orthogonal neighbors so it's genuinely
    // isolated once converted.
    let emptyIdx = -1;
    for (let i = 0; i < brokenCells.length; i++) {
      if (brokenCells[i] !== CELL.EMPTY) continue;
      const x = i % dungeon.width;
      const y = Math.floor(i / dungeon.width);
      const hasWalkableNeighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= dungeon.width || ny < 0 || ny >= dungeon.height) return false;
        return isWalkableCell(brokenCells[ny * dungeon.width + nx]);
      });
      if (!hasWalkableNeighbor) { emptyIdx = i; break; }
    }
    expect(emptyIdx).toBeGreaterThanOrEqual(0);
    brokenCells[emptyIdx] = CELL.HALLWAY;
    const result = validateDungeon({ ...dungeon, cells: brokenCells });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'floor-connectivity')).toBe(true);
  });

  it('flags a floor unreachable from the rest of the dungeon (global connectivity)', () => {
    const dungeon = generateDungeon(MULTI_FLOOR_CONFIG);
    const size = dungeon.width * dungeon.height;
    const brokenCells = dungeon.cells.slice();
    // Clear every VerticalLink footprint cell that touches floor 0 (on
    // floor 0's own side only), severing floor 0 from every floor above it
    // — the only way floors connect at all.
    for (const link of dungeon.links) {
      if (link.fromFloor !== 0 && link.toFloor !== 0) continue;
      for (let dy = 0; dy < link.h; dy++) {
        for (let dx = 0; dx < link.w; dx++) {
          const idx = 0 * size + (link.y + dy) * dungeon.width + (link.x + dx);
          brokenCells[idx] = CELL.EMPTY;
        }
      }
    }
    const result = validateDungeon({ ...dungeon, cells: brokenCells });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'global-connectivity')).toBe(true);
  });
});
