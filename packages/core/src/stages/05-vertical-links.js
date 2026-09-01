import { CELL, getCell, setCell, inBounds } from '../grid.js';

const LINK_W = 2;
const LINK_H = 1;
const MAX_ROOM_GAP = 3;

function footprintFree(grid, x, y, floor, width, height) {
  for (let dy = 0; dy < LINK_H; dy++) {
    for (let dx = 0; dx < LINK_W; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (!inBounds(cx, cy, floor, width, height, floor + 1)) return false;
      if (getCell(grid, cx, cy, floor, width, height) !== CELL.EMPTY) return false;
    }
  }
  return true;
}

// A non-rectangular room's shape leaves CELL.EMPTY cells inside its own
// bounding box (the notch of an L/cross, the corners of a circle/triangle).
// Vertical-link steering is bbox-based by design (SPEC.md — no per-shape
// changes here), so a stair footprint overlapping ANY room's bbox on this
// floor must be rejected even where the cell itself reads CELL.EMPTY.
function overlapsAnyRoomBbox(x, y, floorRooms) {
  for (const room of floorRooms) {
    if (
      x < room.x + room.w && x + LINK_W > room.x &&
      y < room.y + room.h && y + LINK_H > room.y
    ) {
      return true;
    }
  }
  return false;
}

// AABB gap distance (in cells) between a w×h footprint and a room's rect.
// 0 means touching/overlapping; grows by 1 per cell of empty space between them.
function rectGap(fx, fy, fw, fh, room) {
  const dx = Math.max(room.x - (fx + fw), fx - (room.x + room.w), 0);
  const dy = Math.max(room.y - (fy + fh), fy - (room.y + room.h), 0);
  return Math.max(dx, dy);
}

function nearestRoomGap(fx, fy, floorRooms) {
  let best = Infinity;
  for (const room of floorRooms) {
    const gap = rectGap(fx, fy, LINK_W, LINK_H, room);
    if (gap < best) best = gap;
  }
  return best;
}

function nearestRoom(cx, cy, floorRooms) {
  let best = null;
  let bestDist = Infinity;
  for (const room of floorRooms) {
    const d = Math.hypot(room.cx - cx, room.cy - cy);
    if (d < bestDist) {
      bestDist = d;
      best = room;
    }
  }
  return best;
}

function collectCandidates(grid, width, height, floorA, floorB, roomsA, roomsB) {
  const candidates = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!footprintFree(grid, x, y, floorA, width, height)) continue;
      if (!footprintFree(grid, x, y, floorB, width, height)) continue;
      if (overlapsAnyRoomBbox(x, y, roomsA)) continue;
      if (overlapsAnyRoomBbox(x, y, roomsB)) continue;
      if (nearestRoomGap(x, y, roomsA) > MAX_ROOM_GAP) continue;
      if (nearestRoomGap(x, y, roomsB) > MAX_ROOM_GAP) continue;
      candidates.push({ x, y, cx: x + LINK_W / 2, cy: y + LINK_H / 2 });
    }
  }
  return candidates;
}

/**
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floors
 * @param {import('../types.js').Room[]} rooms
 * @param {number} verticalLinksPerGap
 * @param {import('../rng.js').Rng} rng
 */
export function verticalLinks(grid, width, height, floors, rooms, verticalLinksPerGap, rng) {
  const links = [];
  const edges = [];
  const minSeparation = Math.min(width, height) / 3;
  let nextId = 0;

  for (let floorA = 0; floorA < floors - 1; floorA++) {
    const floorB = floorA + 1;
    const roomsA = rooms.filter((r) => r.floor === floorA);
    const roomsB = rooms.filter((r) => r.floor === floorB);

    let candidates = collectCandidates(grid, width, height, floorA, floorB, roomsA, roomsB);
    if (candidates.length === 0) {
      throw new Error(
        `verticalLinks: no valid footprint between floor ${floorA} and floor ${floorB} — ` +
        'every floor pair must have at least one candidate within ' +
        `${MAX_ROOM_GAP} cells of a room on both sides (SPEC.md §5.7 invariant).`
      );
    }

    const chosen = [rng.pick(candidates)];

    for (let i = 1; i < verticalLinksPerGap; i++) {
      const remaining = candidates.filter((c) =>
        chosen.every((picked) => Math.hypot(c.cx - picked.cx, c.cy - picked.cy) >= minSeparation)
      );
      if (remaining.length === 0) break;
      chosen.push(rng.pick(remaining));
    }

    for (const footprint of chosen) {
      for (let dy = 0; dy < LINK_H; dy++) {
        for (let dx = 0; dx < LINK_W; dx++) {
          setCell(grid, footprint.x + dx, footprint.y + dy, floorA, width, height, CELL.STAIR);
          setCell(grid, footprint.x + dx, footprint.y + dy, floorB, width, height, CELL.STAIR);
        }
      }

      const roomFrom = nearestRoom(footprint.cx, footprint.cy, roomsA);
      const roomTo = nearestRoom(footprint.cx, footprint.cy, roomsB);

      const id = nextId++;
      links.push({
        id,
        fromFloor: floorA,
        toFloor: floorB,
        x: footprint.x,
        y: footprint.y,
        w: LINK_W,
        h: LINK_H,
        kind: 'stair',
        roomIdFrom: roomFrom.id,
        roomIdTo: roomTo.id,
      });
      edges.push({
        a: roomFrom.id,
        b: roomTo.id,
        weight: Math.hypot(roomFrom.cx - roomTo.cx, roomFrom.cy - roomTo.cy),
        kind: 'vertical',
      });
    }
  }

  return { links, edges };
}
