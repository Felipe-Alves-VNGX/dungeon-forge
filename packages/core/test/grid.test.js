import { describe, it, expect } from 'vitest';
import { CELL, createGrid, cellIndex, getCell, setCell, inBounds, NO_ROOM, createRoomIdGrid, getRoomId, setRoomId } from '../src/grid.js';

describe('grid', () => {
  it('CELL enum has the five expected values', () => {
    expect(CELL).toEqual({ EMPTY: 0, ROOM: 1, HALLWAY: 2, STAIR: 3, BLOCKED: 4 });
  });

  it('createGrid returns a Uint8Array of the right length, all EMPTY', () => {
    const grid = createGrid(4, 3, 2);
    expect(grid).toBeInstanceOf(Uint8Array);
    expect(grid.length).toBe(4 * 3 * 2);
    expect(grid.every((v) => v === CELL.EMPTY)).toBe(true);
  });

  it('cellIndex matches z * (w*h) + y*w + x', () => {
    expect(cellIndex(1, 2, 0, 10, 5)).toBe(0 * 50 + 2 * 10 + 1);
    expect(cellIndex(1, 2, 1, 10, 5)).toBe(1 * 50 + 2 * 10 + 1);
  });

  it('setCell then getCell round-trips a value', () => {
    const grid = createGrid(5, 5, 1);
    setCell(grid, 2, 3, 0, 5, 5, CELL.ROOM);
    expect(getCell(grid, 2, 3, 0, 5, 5)).toBe(CELL.ROOM);
    expect(getCell(grid, 0, 0, 0, 5, 5)).toBe(CELL.EMPTY);
  });

  it('inBounds is true inside the grid and false outside', () => {
    expect(inBounds(0, 0, 0, 5, 5, 2)).toBe(true);
    expect(inBounds(4, 4, 1, 5, 5, 2)).toBe(true);
    expect(inBounds(5, 0, 0, 5, 5, 2)).toBe(false);
    expect(inBounds(0, 5, 0, 5, 5, 2)).toBe(false);
    expect(inBounds(0, 0, 2, 5, 5, 2)).toBe(false);
    expect(inBounds(-1, 0, 0, 5, 5, 2)).toBe(false);
  });
});

describe('room-id grid', () => {
  it('starts every cell as NO_ROOM', () => {
    const roomIdAt = createRoomIdGrid(5, 5, 2);
    expect(roomIdAt.length).toBe(5 * 5 * 2);
    expect(Array.from(roomIdAt).every((v) => v === NO_ROOM)).toBe(true);
  });

  it('set/get round-trips a room id at a specific cell', () => {
    const roomIdAt = createRoomIdGrid(5, 5, 2);
    setRoomId(roomIdAt, 2, 3, 1, 5, 5, 7);
    expect(getRoomId(roomIdAt, 2, 3, 1, 5, 5)).toBe(7);
    // Neighboring cell and other floor stay untouched.
    expect(getRoomId(roomIdAt, 2, 3, 0, 5, 5)).toBe(NO_ROOM);
    expect(getRoomId(roomIdAt, 3, 3, 1, 5, 5)).toBe(NO_ROOM);
  });
});
