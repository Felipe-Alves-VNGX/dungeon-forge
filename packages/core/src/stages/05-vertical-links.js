import { CELL, getCell, setCell, inBounds } from '../grid.js';

const LINK_W = 2;
const LINK_H = 1;
const PROXIMITY = 3;

function rectDistance(px, py, room) {
  const dx = Math.max(room.x - px, 0, px - (room.x + room.w - 1));
  const dy = Math.max(room.y - py, 0, py - (room.y + room.h - 1));
  return Math.hypot(dx, dy);
}

function footprintFree(grid, width, height, floor, x, y) {
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

function nearRoom(rooms, x, y, radius) {
  return rooms.some((r) => rectDistance(x, y, r) <= radius);
}

/**
 * Collects candidate footprints for one floor gap. Prefers footprints within
 * PROXIMITY cells of a room on both floors (SPEC.md §5.7); falls back to any
 * free footprint if the strict proximity search comes up empty, so a link
 * always exists for the gap rather than silently dropping below
 * verticalLinksPerGap on a cramped seed.
 */
function collectCandidates(grid, width, height, fromFloor, toFloor, roomsFrom, roomsTo) {
  const strict = [];
  const relaxed = [];
  for (let y = 0; y <= height - LINK_H; y++) {
    for (let x = 0; x <= width - LINK_W; x++) {
      if (!footprintFree(grid, width, height, fromFloor, x, y)) continue;
      if (!footprintFree(grid, width, height, toFloor, x, y)) continue;
      relaxed.push({ x, y });
      if (nearRoom(roomsFrom, x, y, PROXIMITY) && nearRoom(roomsTo, x, y, PROXIMITY)) {
        strict.push({ x, y });
      }
    }
  }
  return strict.length > 0 ? strict : relaxed;
}

function dispersionFilter(candidates, chosenFootprints, minDist) {
  if (chosenFootprints.length === 0) return candidates;
  const filtered = candidates.filter((c) =>
    chosenFootprints.every((f) => Math.hypot(c.x - f.x, c.y - f.y) >= minDist));
  return filtered.length > 0 ? filtered : candidates;
}

function pickDispersed(candidates, chosenFootprints, rng) {
  if (chosenFootprints.length === 0) return rng.pick(candidates);
  let best = candidates[0];
  let bestMinDist = -Infinity;
  for (const c of candidates) {
    let minDist = Infinity;
    for (const f of chosenFootprints) {
      minDist = Math.min(minDist, Math.hypot(c.x - f.x, c.y - f.y));
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      best = c;
    }
  }
  return best;
}

/**
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floors
 * @param {Map<number, import('../types.js').Room[]>} roomsByFloor
 * @param {number} verticalLinksPerGap
 * @param {import('../rng.js').Rng} rng
 * @returns {import('../types.js').VerticalLink[]}
 */
export function chooseVerticalLinks(grid, width, height, floors, roomsByFloor, verticalLinksPerGap, rng) {
  const minDist = Math.min(width, height) / 3;
  const links = [];
  const chosenFootprints = [];
  let nextId = 0;

  for (let fromFloor = 0; fromFloor < floors - 1; fromFloor++) {
    const toFloor = fromFloor + 1;
    const roomsFrom = roomsByFloor.get(fromFloor) ?? [];
    const roomsTo = roomsByFloor.get(toFloor) ?? [];

    for (let i = 0; i < verticalLinksPerGap; i++) {
      const candidates = collectCandidates(grid, width, height, fromFloor, toFloor, roomsFrom, roomsTo);
      if (candidates.length === 0) continue;

      const filtered = dispersionFilter(candidates, chosenFootprints, minDist);
      const footprint = pickDispersed(filtered, chosenFootprints, rng);
      chosenFootprints.push(footprint);

      for (const floor of [fromFloor, toFloor]) {
        for (let dy = 0; dy < LINK_H; dy++) {
          for (let dx = 0; dx < LINK_W; dx++) {
            setCell(grid, footprint.x + dx, footprint.y + dy, floor, width, height, CELL.STAIR);
          }
        }
      }

      links.push({
        id: nextId++,
        fromFloor,
        toFloor,
        x: footprint.x,
        y: footprint.y,
        w: LINK_W,
        h: LINK_H,
        kind: 'stair',
      });
    }
  }

  return links;
}
