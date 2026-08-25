// packages/core/test/stages/05-vertical-links.test.js
import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell, getCell } from '../../src/grid.js';
import { verticalLinks } from '../../src/stages/05-vertical-links.js';
import { makeRng } from '../../src/rng.js';

function room(id, floor, x, y, w, h) {
  return { id, floor, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [] };
}

function stampRoom(grid, room_, width, height) {
  for (let y = room_.y; y < room_.y + room_.h; y++) {
    for (let x = room_.x; x < room_.x + room_.w; x++) {
      setCell(grid, x, y, room_.floor, width, height, CELL.ROOM);
    }
  }
}

describe('verticalLinks', () => {
  it('produces at least one link per adjacent floor pair and stamps matching STAIR footprints', () => {
    const width = 30;
    const height = 30;
    const floors = 2;
    const grid = createGrid(width, height, floors);

    const rooms = [
      room(0, 0, 2, 2, 4, 4),
      room(1, 0, 20, 20, 4, 4),
      room(2, 1, 2, 2, 4, 4),
      room(3, 1, 20, 20, 4, 4),
    ];
    for (const r of rooms) stampRoom(grid, r, width, height);

    const { links, edges } = verticalLinks(grid, width, height, floors, rooms, 2, makeRng('vl-seed'));

    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(edges.length).toBe(links.length);

    for (const link of links) {
      expect(getCell(grid, link.x, link.y, link.fromFloor, width, height)).toBe(CELL.STAIR);
      expect(getCell(grid, link.x, link.y, link.toFloor, width, height)).toBe(CELL.STAIR);
      expect(getCell(grid, link.x + 1, link.y, link.fromFloor, width, height)).toBe(CELL.STAIR);
      expect(getCell(grid, link.x + 1, link.y, link.toFloor, width, height)).toBe(CELL.STAIR);
    }
  });

  it('every VerticalLink footprint stays clear of room cells', () => {
    const width = 30;
    const height = 30;
    const floors = 2;
    const grid = createGrid(width, height, floors);
    const rooms = [room(0, 0, 5, 5, 6, 6), room(1, 1, 5, 5, 6, 6)];
    for (const r of rooms) stampRoom(grid, r, width, height);

    const { links } = verticalLinks(grid, width, height, floors, rooms, 2, makeRng('vl-seed-2'));
    for (const link of links) {
      for (let dx = 0; dx < link.w; dx++) {
        const isRoomCellFrom = rooms.some(
          (r) => r.floor === link.fromFloor && link.x + dx >= r.x && link.x + dx < r.x + r.w &&
            link.y >= r.y && link.y < r.y + r.h
        );
        expect(isRoomCellFrom).toBe(false);
      }
    }
  });

  it('is deterministic given the same seed', () => {
    const width = 30;
    const height = 30;
    const floors = 2;
    const gridA = createGrid(width, height, floors);
    const gridB = createGrid(width, height, floors);
    const rooms = [
      room(0, 0, 2, 2, 4, 4), room(1, 0, 20, 20, 4, 4),
      room(2, 1, 2, 2, 4, 4), room(3, 1, 20, 20, 4, 4),
    ];
    for (const g of [gridA, gridB]) for (const r of rooms) stampRoom(g, r, width, height);

    const a = verticalLinks(gridA, width, height, floors, rooms, 2, makeRng('vl-det'));
    const b = verticalLinks(gridB, width, height, floors, rooms, 2, makeRng('vl-det'));
    expect(a.links).toEqual(b.links);
    expect(a.edges).toEqual(b.edges);
  });

  it('throws when a floor gap has no valid candidate footprint', () => {
    const width = 4;
    const height = 4;
    const floors = 2;
    const grid = createGrid(width, height, floors);
    // No rooms at all — every candidate fails the "within 3 cells of a room" check.
    expect(() => verticalLinks(grid, width, height, floors, [], 2, makeRng('vl-fail'))).toThrow(/no valid footprint/i);
  });
});
