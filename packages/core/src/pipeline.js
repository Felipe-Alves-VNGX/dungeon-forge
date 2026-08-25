// packages/core/src/pipeline.js
import { deriveRng } from './rng.js';
import { CELL, createGrid, setCell } from './grid.js';
import { placeRooms } from './stages/01-place-rooms.js';
import { triangulate } from './stages/02-triangulate.js';
import { spanningTree } from './stages/03-spanning-tree.js';
import { addCycles } from './stages/04-add-cycles.js';
import { verticalLinks } from './stages/05-vertical-links.js';
import { carve, thickenCorridors } from './stages/06-carve.js';
import { prune } from './stages/07-prune.js';
import { mission } from './stages/08-mission.js';
import { buildKey, keyToMarkdown } from './stages/09-key.js';
import { extractWalls } from './stages/10-extract-walls.js';

/** @param {import('./types.js').Config} config */
export function generateDungeon(config) {
  const grid = createGrid(config.width, config.height, config.floors);

  const rooms = [];
  const edges = [];
  const residualCellsByFloor = [];
  let nextRoomId = 0;

  for (let floor = 0; floor < config.floors; floor++) {
    const { rooms: floorRooms, residualCells } = placeRooms(
      config.rooms, floor, deriveRng(config.seed, `place-rooms:${floor}`)
    );

    for (const room of floorRooms) {
      room.id = nextRoomId++;

      // Defensive clamp: steering separation in placeRooms can still push a
      // room's centroid beyond the initial spawn disk in some seeds, landing
      // it partially or fully outside the grid. Clamp position into bounds and
      // recompute the centroid before stamping the grid or running any other
      // stage. This can rarely nudge a clamped room into overlapping an
      // in-bounds neighbor — harmless at this scope (see task brief).
      room.x = Math.max(0, Math.min(room.x, config.width - room.w));
      room.y = Math.max(0, Math.min(room.y, config.height - room.h));
      room.cx = room.x + room.w / 2;
      room.cy = room.y + room.h / 2;
    }

    for (const room of floorRooms) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          setCell(grid, x, y, floor, config.width, config.height, CELL.ROOM);
        }
      }
    }

    const allEdges = triangulate(floorRooms);
    const mstEdges = spanningTree(floorRooms, allEdges);
    const floorEdges = addCycles(
      allEdges, mstEdges, config.cycleRate, deriveRng(config.seed, `add-cycles:${floor}`)
    );

    rooms.push(...floorRooms);
    edges.push(...floorEdges);
    residualCellsByFloor.push(residualCells);
  }

  const { links, edges: verticalEdges } = config.floors > 1
    ? verticalLinks(
        grid, config.width, config.height, config.floors, rooms,
        config.verticalLinksPerGap, deriveRng(config.seed, 'vertical-links')
      )
    : { links: [], edges: [] };
  edges.push(...verticalEdges);

  const floorById = new Map(rooms.map((r) => [r.id, r.floor]));

  let doorIdOffset = 0;
  const walls = [];
  const doors = [];

  for (let floor = 0; floor < config.floors; floor++) {
    const floorRooms = rooms.filter((r) => r.floor === floor);
    const floorEdges = edges.filter(
      (e) => e.kind !== 'vertical' && floorById.get(e.a) === floor && floorById.get(e.b) === floor
    );

    carve(grid, config.width, config.height, floor, floorRooms, floorEdges, config.carve, links);
    thickenCorridors(grid, config.width, config.height, floor, residualCellsByFloor[floor]);
    prune(grid, config.width, config.height, floor, config.pruneIterations);

    const { walls: floorWalls, doors: floorDoors } = extractWalls(
      grid, config.width, config.height, floor, floorRooms
    );

    for (const door of floorDoors) door.id += doorIdOffset;
    for (const wall of floorWalls) {
      if (wall.doorId !== null) wall.doorId += doorIdOffset;
    }
    for (const room of floorRooms) {
      room.doors = room.doors.map((id) => id + doorIdOffset);
    }
    doorIdOffset += floorDoors.length;

    walls.push(...floorWalls);
    doors.push(...floorDoors);
  }

  const missionResult = mission(rooms, edges, links);

  const roomAdjacency = edges.filter((e) => e.kind !== 'vertical').map((e) => ({ a: e.a, b: e.b }));
  const { areas, key } = buildKey(
    rooms, roomAdjacency, missionResult.entranceRoomId, config.key, links
  );

  return {
    config,
    seed: config.seed,
    width: config.width,
    height: config.height,
    floors: config.floors,
    cells: grid,
    rooms,
    edges,
    links,
    doors,
    walls,
    mission: missionResult,
    areas,
    key,
  };
}

export { keyToMarkdown };
