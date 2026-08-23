// packages/core/src/pipeline.js
import { deriveRng } from './rng.js';
import { CELL, createGrid, setCell } from './grid.js';
import { placeRooms } from './stages/01-place-rooms.js';
import { triangulate } from './stages/02-triangulate.js';
import { spanningTree } from './stages/03-spanning-tree.js';
import { addCycles } from './stages/04-add-cycles.js';
import { chooseVerticalLinks } from './stages/05-vertical-links.js';
import { carve, carveToPoint, thickenCorridors } from './stages/06-carve.js';
import { prune } from './stages/07-prune.js';
import { mission } from './stages/08-mission.js';
import { buildKey, keyToMarkdown } from './stages/09-key.js';
import { extractWalls } from './stages/10-extract-walls.js';
import { validateDungeon } from './validate.js';

function clampRoomToGrid(room, width, height) {
  // Defensive clamp: steering separation in placeRooms can still push a
  // room's centroid beyond the initial spawn disk in some seeds, landing it
  // partially or fully outside the grid. This can rarely nudge a clamped
  // room into overlapping an in-bounds neighbor — harmless at this scope.
  room.x = Math.max(0, Math.min(room.x, width - room.w));
  room.y = Math.max(0, Math.min(room.y, height - room.h));
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
}

function stampRoom(grid, room, floor, width, height) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      setCell(grid, x, y, floor, width, height, CELL.ROOM);
    }
  }
}

function nearestRoom(rooms, x, y) {
  let best = rooms[0];
  let bestDist = Infinity;
  for (const r of rooms) {
    const d = Math.hypot(r.cx - x, r.cy - y);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}

function tooClose(a, b) {
  return a.x < b.x + b.w + 1 && a.x + a.w + 1 > b.x && a.y < b.y + b.h + 1 && a.y + a.h + 1 > b.y;
}

function overlapsAny(room, placed) {
  return placed.some((other) => tooClose(room, other));
}

/**
 * Scans grid positions in row-major order and returns the first one where a
 * room of `room.w x room.h` doesn't overlap anything in `placed`. Returns
 * null if no such position exists anywhere on the floor.
 */
function findFreePosition(room, placed, width, height) {
  for (let y = 0; y <= height - room.h; y++) {
    for (let x = 0; x <= width - room.w; x++) {
      const candidate = { x, y, w: room.w, h: room.h };
      if (!overlapsAny(candidate, placed)) return { x, y };
    }
  }
  return null;
}

/**
 * Deterministically resolves any residual overlap **or zero-gap adjacency**
 * between rooms on the same floor. placeRooms' steering separation (SPEC.md
 * §5.3) and clampRoomToGrid's defensive bounds clamp can each leave two rooms
 * overlapping. An overlapping pair silently merges into one blob in the grid
 * (CELL.ROOM carries no room id), so extractWalls can't tell the rooms apart
 * and the covered room ends up with zero doors (SPEC.md §6 invariant 8).
 * SPEC.md §5.3 requires ≥1 cell of clearance on every side of a room —
 * `tooClose` checks that directly by padding each room's far edge by 1 cell
 * before testing intersection, so two rooms are rejected as conflicting
 * whenever their gap is less than 1 cell, not only when they actually
 * overlap. Rooms are processed in id order and only ever relocated relative
 * to already-placed earlier rooms — a room that still overlaps after
 * relocation is left in place (rather than looping forever) on the rare
 * floor with no free space of its size left; downstream validation surfaces
 * that case the same way it always did, instead of this pass masking it with
 * a nonsensical result.
 * @param {import('./types.js').Room[]} rooms
 * @param {number} width @param {number} height
 */
function resolveOverlaps(rooms, width, height) {
  const placed = [];
  for (const room of rooms) {
    if (overlapsAny(room, placed)) {
      const spot = findFreePosition(room, placed, width, height);
      if (spot) {
        room.x = spot.x;
        room.y = spot.y;
        room.cx = room.x + room.w / 2;
        room.cy = room.y + room.h / 2;
      }
    }
    placed.push(room);
  }
}

function linkFootprintCenter(link) {
  return { x: link.x + (link.w - 1) / 2, y: link.y + (link.h - 1) / 2 };
}

/** @param {import('./types.js').Config} config */
export function generateDungeon(config) {
  const { width, height, floors } = config;
  const grid = createGrid(width, height, floors);

  const roomsByFloor = new Map();
  const residualByFloor = new Map();
  const edgesByFloor = new Map();
  let nextRoomId = 0;

  for (let floor = 0; floor < floors; floor++) {
    const { rooms, residualCells } = placeRooms(
      config.rooms, floor, deriveRng(`${config.seed}:${floor}`, 'place-rooms'),
    );

    for (const room of rooms) {
      clampRoomToGrid(room, width, height);
      room.id = nextRoomId++;
    }
    resolveOverlaps(rooms, width, height);
    for (const room of rooms) stampRoom(grid, room, floor, width, height);

    roomsByFloor.set(floor, rooms);
    residualByFloor.set(floor, residualCells);

    const floorAllEdges = triangulate(rooms);
    const mstEdges = spanningTree(rooms, floorAllEdges);
    const edges = addCycles(
      floorAllEdges, mstEdges, config.cycleRate, deriveRng(`${config.seed}:${floor}`, 'add-cycles'),
    );
    edgesByFloor.set(floor, edges);
  }

  const links = chooseVerticalLinks(
    grid, width, height, floors, roomsByFloor, config.verticalLinksPerGap,
    deriveRng(config.seed, 'vertical-links'),
  );

  for (let floor = 0; floor < floors; floor++) {
    carve(grid, width, height, floor, roomsByFloor.get(floor), edgesByFloor.get(floor), config.carve);
  }

  const verticalEdges = [];
  for (const link of links) {
    const center = linkFootprintCenter(link);
    const fromRoom = nearestRoom(roomsByFloor.get(link.fromFloor), center.x, center.y);
    const toRoom = nearestRoom(roomsByFloor.get(link.toFloor), center.x, center.y);
    carveToPoint(grid, width, height, link.fromFloor, fromRoom, center, config.carve);
    carveToPoint(grid, width, height, link.toFloor, toRoom, center, config.carve);
    const weight = Math.hypot(fromRoom.cx - center.x, fromRoom.cy - center.y)
      + Math.hypot(toRoom.cx - center.x, toRoom.cy - center.y);
    verticalEdges.push({ a: fromRoom.id, b: toRoom.id, weight, kind: 'vertical' });
  }

  for (let floor = 0; floor < floors; floor++) {
    thickenCorridors(grid, width, height, floor, residualByFloor.get(floor));
    prune(grid, width, height, floor, config.pruneIterations);
  }

  const allRooms = [...roomsByFloor.values()].flat();
  const allEdges = [...edgesByFloor.values()].flat().concat(verticalEdges);

  const missionResult = mission(allRooms, allEdges);

  let walls = [];
  let doors = [];
  let doorIdOffset = 0;
  for (let floor = 0; floor < floors; floor++) {
    const rooms = roomsByFloor.get(floor);
    const result = extractWalls(grid, width, height, floor, rooms);

    for (const wall of result.walls) {
      if (wall.isDoor) wall.doorId += doorIdOffset;
    }
    for (const door of result.doors) {
      door.id += doorIdOffset;
    }
    for (const room of rooms) {
      room.doors = room.doors.map((id) => id + doorIdOffset);
    }

    walls = walls.concat(result.walls);
    doors = doors.concat(result.doors);
    doorIdOffset += result.doors.length;
  }

  const roomAdjacency = allEdges
    .filter((e) => e.kind !== 'vertical')
    .map((e) => ({ a: e.a, b: e.b }));
  const { areas, key } = buildKey(allRooms, roomAdjacency, missionResult.entranceRoomId, config.key);

  return {
    config,
    seed: config.seed,
    width,
    height,
    floors,
    cells: grid,
    rooms: allRooms,
    edges: allEdges,
    links,
    doors,
    walls,
    mission: missionResult,
    areas,
    key,
  };
}

export { keyToMarkdown, validateDungeon };
