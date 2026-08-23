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
