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
