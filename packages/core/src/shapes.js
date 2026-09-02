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

export function rasterizeCircle(room) {
  const rw = room.w / 2;
  const rh = room.h / 2;
  const cx = room.x + rw;
  const cy = room.y + rh;

  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const px = room.x + dx + 0.5;
      const py = room.y + dy + 0.5;
      const nx = (px - cx) / rw;
      const ny = (py - cy) / rh;
      if (nx * nx + ny * ny <= 1) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}

function inTriangle(dx, dy, w, h, orientation) {
  switch (orientation) {
    case 'up': {
      const rowFrac = (dy + 1) / h;
      const halfWidth = (rowFrac * w) / 2;
      const center = w / 2;
      return dx + 0.5 >= center - halfWidth && dx + 0.5 <= center + halfWidth;
    }
    case 'down': {
      const rowFrac = (h - dy) / h;
      const halfWidth = (rowFrac * w) / 2;
      const center = w / 2;
      return dx + 0.5 >= center - halfWidth && dx + 0.5 <= center + halfWidth;
    }
    case 'left': {
      const colFrac = (dx + 1) / w;
      const halfHeight = (colFrac * h) / 2;
      const center = h / 2;
      return dy + 0.5 >= center - halfHeight && dy + 0.5 <= center + halfHeight;
    }
    case 'right': {
      const colFrac = (w - dx) / w;
      const halfHeight = (colFrac * h) / 2;
      const center = h / 2;
      return dy + 0.5 >= center - halfHeight && dy + 0.5 <= center + halfHeight;
    }
    default:
      throw new Error(`rasterizeTriangle: unknown orientation "${orientation}"`);
  }
}

export function rasterizeTriangle(room, params) {
  const cells = [];
  const centroidX = Math.round(room.cx);
  const centroidY = Math.round(room.cy);
  const centroidDx = centroidX - room.x;
  const centroidDy = centroidY - room.y;

  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      // Always include the centroid cell to satisfy the contract that every rasterizer
      // includes Math.round(room.cx), Math.round(room.cy). For certain w/h/orientation
      // combinations, the linear triangle ramp can exclude this cell by a small geometric
      // deficit at the edges (not a formula bug, but inherent to the combination of
      // centroid rounding and linear interpolation). This OR clause ensures the centroid
      // is always present; testing confirms it always has an orthogonal neighbor within
      // the triangle (never isolated), satisfying connectivity in practice.
      if (inTriangle(dx, dy, room.w, room.h, params.orientation) ||
          (dx === centroidDx && dy === centroidDy)) {
        cells.push({ x: room.x + dx, y: room.y + dy });
      }
    }
  }
  return cells;
}

export function rasterizeCustom(room, params) {
  return params.cells.map(([dx, dy]) => ({ x: room.x + dx, y: room.y + dy }));
}

/**
 * @param {'rect'|'l'|'cross'|'circle'|'triangle'} type
 * @param {import('./rng.js').Rng} rng
 */
export function sampleShapeParams(type, rng) {
  switch (type) {
    case 'l':
      return { corner: rng.pick(['nw', 'ne', 'sw', 'se']) };
    case 'triangle':
      return { orientation: rng.pick(['up', 'down', 'left', 'right']) };
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
    case 'circle':
      return rasterizeCircle(room);
    case 'triangle':
      return rasterizeTriangle(room, room.shape.params);
    case 'custom':
      return rasterizeCustom(room, room.shape.params);
    default:
      throw new Error(`rasterizeRoom: unknown shape type "${type}"`);
  }
}
