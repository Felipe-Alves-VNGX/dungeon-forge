import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell, getCell } from '../../src/grid.js';
import { prune } from '../../src/stages/07-prune.js';

describe('prune', () => {
  it('removes a dead-end HALLWAY stub but preserves the through-corridor it branches from', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 1, 5, 0, width, height, CELL.ROOM);
    setCell(grid, 8, 5, 0, width, height, CELL.ROOM);
    for (let x = 2; x <= 7; x++) setCell(grid, x, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 5, 4, 0, width, height, CELL.HALLWAY);
    setCell(grid, 5, 3, 0, width, height, CELL.HALLWAY);

    prune(grid, width, height, 0, 8);

    expect(getCell(grid, 5, 3, 0, width, height)).toBe(CELL.EMPTY);
    expect(getCell(grid, 5, 4, 0, width, height)).toBe(CELL.EMPTY);
    for (let x = 2; x <= 7; x++) {
      expect(getCell(grid, x, 5, 0, width, height)).toBe(CELL.HALLWAY);
    }
  });

  it('preserves a HALLWAY cell adjacent to a ROOM even with only one walkable neighbor', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 5, 5, 0, width, height, CELL.ROOM);
    setCell(grid, 5, 4, 0, width, height, CELL.HALLWAY);
    prune(grid, width, height, 0, 8);
    expect(getCell(grid, 5, 4, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('preserves a HALLWAY cell adjacent to a STAIR', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 5, 5, 0, width, height, CELL.STAIR);
    setCell(grid, 5, 4, 0, width, height, CELL.HALLWAY);
    prune(grid, width, height, 0, 8);
    expect(getCell(grid, 5, 4, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('does not touch a HALLWAY cell with 2 walkable neighbors (mid-corridor)', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 1, 5, 0, width, height, CELL.ROOM);
    setCell(grid, 5, 5, 0, width, height, CELL.ROOM);
    for (let x = 2; x <= 4; x++) setCell(grid, x, 5, 0, width, height, CELL.HALLWAY);
    prune(grid, width, height, 0, 8);
    expect(getCell(grid, 3, 5, 0, width, height)).toBe(CELL.HALLWAY);
  });

  it('evaluates each iteration from a stable snapshot, not cascading within the same pass', () => {
    const width = 10, height = 10;
    const grid = createGrid(width, height, 1);
    setCell(grid, 3, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 4, 5, 0, width, height, CELL.HALLWAY);
    setCell(grid, 5, 5, 0, width, height, CELL.HALLWAY);
    prune(grid, width, height, 0, 1);
    // Both original degree-1 ends are pruned in this single pass (evaluated
    // against the pre-pass grid), leaving the now-isolated middle cell —
    // SPEC.md's rule only fires on cells that were degree-1 *before* the pass.
    expect(getCell(grid, 3, 5, 0, width, height)).toBe(CELL.EMPTY);
    expect(getCell(grid, 5, 5, 0, width, height)).toBe(CELL.EMPTY);
    expect(getCell(grid, 4, 5, 0, width, height)).toBe(CELL.HALLWAY);
  });
});
