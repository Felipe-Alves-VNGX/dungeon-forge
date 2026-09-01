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

export function rasterizeL(room, params) {
  const notchW = Math.floor((room.w - 1) / 3);
  const notchH = Math.floor((room.h - 1) / 3);
  const notchXStart = params.corner === 'ne' || params.corner === 'se' ? room.w - notchW : 0;
  const notchYStart = params.corner === 'sw' || params.corner === 'se' ? room.h - notchH : 0;

  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const inNotch =
        dx >= notchXStart && dx < notchXStart + notchW &&
        dy >= notchYStart && dy < notchYStart + notchH;
      if (!inNotch) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}

export function rasterizeCross(room) {
  const notchW = Math.floor((room.w - 1) / 3);
  const notchH = Math.floor((room.h - 1) / 3);

  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const inVerticalArm = dx >= notchW && dx < room.w - notchW;
      const inHorizontalArm = dy >= notchH && dy < room.h - notchH;
      if (inVerticalArm || inHorizontalArm) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}

/**
 * @param {'rect'|'l'|'cross'|'circle'|'triangle'} type
 * @param {import('./rng.js').Rng} rng
 */
export function sampleShapeParams(type, rng) {
  switch (type) {
    case 'l':
      return { corner: rng.pick(['nw', 'ne', 'sw', 'se']) };
    default:
      return {};
  }
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
    case 'l':
      return rasterizeL(room, room.shape.params);
    case 'cross':
      return rasterizeCross(room);
    default:
      throw new Error(`rasterizeRoom: unknown shape type "${type}"`);
  }
}
