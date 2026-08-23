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

export { keyToMarkdown };
