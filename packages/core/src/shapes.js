// packages/core/src/shapes.js
//
// Each rasterize<Shape> function is pure: (room) => Array<{x,y}> of absolute
// grid cells belonging to that room. Every rasterizer MUST include
// (Math.round(room.cx), Math.round(room.cy)) in its output — carve.js's
// roomBoundaryCell relies on that cell always being a real CELL.ROOM cell of
// this room, and changing that contract would require changes to carve.js
// this design deliberately avoids (see the design doc).

export function rasterizeRect(room) {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * @param {import('./types.js').Room} room
 * @returns {Array<{x:number,y:number}>}
 */
export function rasterizeRoom(room) {
  const type = room.shape?.type ?? 'rect';
  switch (type) {
    case 'rect':
      return rasterizeRect(room);
    default:
      throw new Error(`rasterizeRoom: unknown shape type "${type}"`);
  }
}
