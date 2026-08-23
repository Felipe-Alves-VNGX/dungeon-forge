export const CELL = Object.freeze({
  EMPTY: 0,
  ROOM: 1,
  HALLWAY: 2,
  STAIR: 3,
  BLOCKED: 4,
});

/** @param {number} width @param {number} height @param {number} floors */
export function createGrid(width, height, floors) {
  return new Uint8Array(width * height * floors);
}

export function cellIndex(x, y, z, width, height) {
  return z * (width * height) + y * width + x;
}

export function getCell(grid, x, y, z, width, height) {
  return grid[cellIndex(x, y, z, width, height)];
}

export function setCell(grid, x, y, z, width, height, value) {
  grid[cellIndex(x, y, z, width, height)] = value;
}

export function inBounds(x, y, z, width, height, floors) {
  return x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < floors;
}

export function isWalkable(value) {
  return value === CELL.ROOM || value === CELL.HALLWAY || value === CELL.STAIR;
}
