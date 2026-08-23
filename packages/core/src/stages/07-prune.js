import { CELL, getCell, setCell, inBounds, isWalkable } from '../grid.js';

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function walkableNeighborCount(grid, width, height, floor, x, y) {
  let count = 0;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
    if (isWalkable(getCell(grid, nx, ny, floor, width, height))) count++;
  }
  return count;
}

function touchesRoomOrStair(grid, width, height, floor, x, y) {
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
    const v = getCell(grid, nx, ny, floor, width, height);
    if (v === CELL.ROOM || v === CELL.STAIR) return true;
  }
  return false;
}

/**
 * Iterative dead-end removal (SPEC.md §5.9). Each iteration is evaluated
 * against a snapshot taken at the start of that iteration — cells cleared
 * mid-pass don't retroactively change what else clears in the same pass —
 * so results don't depend on scan order.
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {number} iterations
 */
export function prune(grid, width, height, floor, iterations) {
  for (let iter = 0; iter < iterations; iter++) {
    const toClear = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (getCell(grid, x, y, floor, width, height) !== CELL.HALLWAY) continue;
        if (walkableNeighborCount(grid, width, height, floor, x, y) !== 1) continue;
        if (touchesRoomOrStair(grid, width, height, floor, x, y)) continue;
        toClear.push([x, y]);
      }
    }
    if (toClear.length === 0) break;
    for (const [x, y] of toClear) {
      setCell(grid, x, y, floor, width, height, CELL.EMPTY);
    }
  }
}
