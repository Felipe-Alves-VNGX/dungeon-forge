import { CELL, getCell, setCell, inBounds } from '../grid.js';

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

function isWalkable(value) {
  return value === CELL.ROOM || value === CELL.HALLWAY || value === CELL.STAIR;
}

function isProtected(value) {
  return value === CELL.ROOM || value === CELL.STAIR;
}

/**
 * Iteratively removes dead-end HALLWAY tendrils — SPEC.md §5.9. A stray
 * one-cell-wide dead end reads as a bug on a battlemap; intentional dead
 * ends (optional/treasure branches) are created afterwards by stage 8 and
 * are rooms, so they're protected here the same way any room is.
 *
 * Doors don't exist yet at this point in the pipeline (stage 10 runs after
 * this one) — SPEC's "não for adjacente a sala, escada ou porta" collapses
 * to "sala ou escada" here, since a door is by definition the hallway/room
 * boundary and is already covered by the room-adjacency check.
 *
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {number} iterations
 */
export function prune(grid, width, height, floor, iterations) {
  for (let iter = 0; iter < iterations; iter++) {
    const toRemove = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (getCell(grid, x, y, floor, width, height) !== CELL.HALLWAY) continue;

        let walkableNeighbors = 0;
        let protectedNeighbor = false;
        for (const { dx, dy } of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
          const value = getCell(grid, nx, ny, floor, width, height);
          if (isWalkable(value)) walkableNeighbors++;
          if (isProtected(value)) protectedNeighbor = true;
        }

        if (walkableNeighbors === 1 && !protectedNeighbor) {
          toRemove.push({ x, y });
        }
      }
    }

    if (toRemove.length === 0) break;
    for (const { x, y } of toRemove) {
      setCell(grid, x, y, floor, width, height, CELL.EMPTY);
    }
  }
}
