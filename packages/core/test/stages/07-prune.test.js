// packages/core/test/stages/07-prune.test.js
import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell, getCell } from '../../src/grid.js';
import { prune } from '../../src/stages/07-prune.js';

describe('prune', () => {
  it('removes a one-cell dead-end tendril off a corridor', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    // Two rooms joined by a corridor y=5, x=1..5, plus a dead-end spur
    // going up from x=5 that isn't protected by anything.
    setCell(grid, 0, 5, 0, width, height, CELL.ROOM);
    setCell(grid, 6, 5, 0, width, height, CELL.ROOM);
    for (let x = 1; x <= 5; x++) setCell(grid, x, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 5, 4, 0, width, height, CELL.HALLWAY);
    setCell(grid, 5, 3, 0, width, height, CELL.HALLWAY);

    prune(grid, width, height, 0, 8);

    expect(getCell(grid, 5, 3, 0, width, height)).toBe(CELL.EMPTY);
    expect(getCell(grid, 5, 4, 0, width, height)).toBe(CELL.EMPTY);
    // The through-corridor itself must survive.
    for (let x = 1; x <= 5; x++) {
      expect(getCell(grid, x, 5, 0, width, height)).toBe(CELL.HALLWAY);
    }
  });

  it('never removes the sole corridor connecting two rooms', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 1, 5, 0, width, height, CELL.ROOM);
    setCell(grid, 2, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 3, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 4, 5, 0, width, height, CELL.ROOM);

    prune(grid, width, height, 0, 8);

    expect(getCell(grid, 2, 5, 0, width, height)).toBe(CELL.HALLWAY);
    expect(getCell(grid, 3, 5, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('never removes a hallway cell adjacent to a STAIR footprint', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 5, 5, 0, width, height, CELL.STAIR);
    setCell(grid, 4, 5, 0, width, height, CELL.HALLWAY);

    prune(grid, width, height, 0, 8);

    expect(getCell(grid, 4, 5, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('is a no-op with iterations: 0', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 5, 5, 0, width, height, CELL.HALLWAY);
    const before = Array.from(grid);

    prune(grid, width, height, 0, 0);

    expect(Array.from(grid)).toEqual(before);
  });
});
