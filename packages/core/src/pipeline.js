// packages/core/src/pipeline.js
import { deriveRng } from './rng.js';
import { CELL, createGrid, setCell } from './grid.js';
import { placeRooms } from './stages/01-place-rooms.js';
import { triangulate } from './stages/02-triangulate.js';
import { spanningTree } from './stages/03-spanning-tree.js';
import { addCycles } from './stages/04-add-cycles.js';
import { carve } from './stages/06-carve.js';
import { mission } from './stages/08-mission.js';
import { buildKey, keyToMarkdown } from './stages/09-key.js';
import { extractWalls } from './stages/10-extract-walls.js';

/** @param {import('./types.js').Config} config */
export function generateDungeon(config) {
  if (config.floors !== 1) {
    throw new Error(
      `generateDungeon: floors=${config.floors} is not supported yet — multi-floor wiring ` +
      `(verticalLinks, prune) ships in the M5 follow-up plan. Use floors: 1.`
    );
  }

  const floor = 0;
  const grid = createGrid(config.width, config.height, config.floors);

  const { rooms } = placeRooms(config.rooms, floor, deriveRng(config.seed, 'place-rooms'));

  // Defensive clamp: steering separation in placeRooms can still push a
  // room's centroid beyond the initial spawn disk in some seeds, landing
  // it partially or fully outside the grid. Clamp position into bounds and
  // recompute the centroid before stamping the grid or running any other
  // stage. This can rarely nudge a clamped room into overlapping an
  // in-bounds neighbor — harmless at this scope (see task brief).
  for (const room of rooms) {
    room.x = Math.max(0, Math.min(room.x, config.width - room.w));
    room.y = Math.max(0, Math.min(room.y, config.height - room.h));
    room.cx = room.x + room.w / 2;
    room.cy = room.y + room.h / 2;
  }

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        setCell(grid, x, y, floor, config.width, config.height, CELL.ROOM);
      }
    }
  }

  const allEdges = triangulate(rooms);
  const mstEdges = spanningTree(rooms, allEdges);
  const edges = addCycles(allEdges, mstEdges, config.cycleRate, deriveRng(config.seed, 'add-cycles'));

  carve(grid, config.width, config.height, floor, rooms, edges, config.carve);

  const missionResult = mission(rooms, edges);

  const { walls, doors } = extractWalls(grid, config.width, config.height, floor, rooms);

  const roomAdjacency = edges.map((e) => ({ a: e.a, b: e.b }));
  const { areas, key } = buildKey(rooms, roomAdjacency, missionResult.entranceRoomId, config.key);

  return {
    config,
    seed: config.seed,
    width: config.width,
    height: config.height,
    floors: config.floors,
    cells: grid,
    rooms,
    edges,
    links: [],
    doors,
    walls,
    mission: missionResult,
    areas,
    key,
  };
}

export { keyToMarkdown };
