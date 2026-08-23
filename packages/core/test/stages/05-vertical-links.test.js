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
