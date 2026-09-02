// packages/core/src/pipeline.js
import { deriveRng } from './rng.js';
import { CELL, createGrid, setCell, createRoomIdGrid, setRoomId } from './grid.js';
import { rasterizeRoom } from './shapes.js';
import { placeRooms } from './stages/01-place-rooms.js';
import { triangulate } from './stages/02-triangulate.js';
import { spanningTree } from './stages/03-spanning-tree.js';
import { addCycles } from './stages/04-add-cycles.js';
import { verticalLinks } from './stages/05-vertical-links.js';
import { carve, thickenCorridors } from './stages/06-carve.js';
import { prune } from './stages/07-prune.js';
import { mission, assignSecretDoors } from './stages/08-mission.js';
import { buildKey, keyToMarkdown } from './stages/09-key.js';
import { extractWalls } from './stages/10-extract-walls.js';
import { validateDungeon } from './validate.js';

// Clamping an out-of-bounds room straight into bounds (below) can leave it
// touching or overlapping an already in-bounds neighbor — breaking stage 1's
// own invariant ("toda sala tem >=1 célula de folga em cada lado"). That's
// not cosmetic: when two rooms end up with zero gap, carve's A* between
// their centroids walks straight through ROOM cells the whole way (nothing
// EMPTY to convert to HALLWAY), so no corridor — and therefore no door —
// ever gets carved between them, silently orphaning whichever room has no
// other edge. Re-run the same steering-separation push stage 1 already uses
// (see 01-place-rooms.js), just with a required 1-cell gap and a reclamp
// each pass, until no pair overlaps. A no-op (0 iterations of actual push)
// whenever clamping didn't introduce an overlap, so it never perturbs a
// layout that was already valid.
function separateClampedRooms(floorRooms, width, height) {
  for (let pass = 0; pass < 60; pass++) {
    let anyOverlap = false;
    for (const a of floorRooms) {
      let pushX = 0;
      let pushY = 0;
      for (const b of floorRooms) {
        if (a === b) continue;
        const dx = (a.x + a.w / 2) - (b.x + b.w / 2);
        const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
        const overlapX = (a.w + b.w) / 2 + 1 - Math.abs(dx);
        const overlapY = (a.h + b.h) / 2 + 1 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          anyOverlap = true;
          const dist = Math.hypot(dx, dy) || 0.0001;
          pushX += (dx / dist) * overlapX * 0.5;
          pushY += (dy / dist) * overlapY * 0.5;
        }
      }
      // Round away from zero with a 1-cell floor: a plain Math.round can
      // land back on the same integer every pass when the summed push is
      // under 0.5 (common with the *0.5 damping above plus two rooms
      // pushing each other by comparable amounts), stalling forever exactly
      // 1 cell short of resolving the overlap.
      const stepX = pushX === 0 ? 0 : Math.sign(pushX) * Math.max(1, Math.round(Math.abs(pushX)));
      const stepY = pushY === 0 ? 0 : Math.sign(pushY) * Math.max(1, Math.round(Math.abs(pushY)));
      a.x = Math.max(0, Math.min(a.x + stepX, width - a.w));
      a.y = Math.max(0, Math.min(a.y + stepY, height - a.h));
    }
    if (!anyOverlap) break;
  }
  for (const room of floorRooms) {
    room.cx = room.x + room.w / 2;
    room.cy = room.y + room.h / 2;
  }
}

/** @param {import('./types.js').Config} config */
export function generateDungeon(config) {
  const grid = createGrid(config.width, config.height, config.floors);
  const roomIdAt = createRoomIdGrid(config.width, config.height, config.floors);

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
      // it partially or fully outside the grid. Clamp position into bounds
      // before stamping the grid or running any other stage.
      room.x = Math.max(0, Math.min(room.x, config.width - room.w));
      room.y = Math.max(0, Math.min(room.y, config.height - room.h));
      room.cx = room.x + room.w / 2;
      room.cy = room.y + room.h / 2;
    }

    separateClampedRooms(floorRooms, config.width, config.height);

    for (const room of floorRooms) {
      for (const cell of rasterizeRoom(room)) {
        setCell(grid, cell.x, cell.y, floor, config.width, config.height, CELL.ROOM);
        setRoomId(roomIdAt, cell.x, cell.y, floor, config.width, config.height, room.id);
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
      grid, roomIdAt, config.width, config.height, floor, floorRooms
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
  assignSecretDoors(rooms, doors);

  const roomAdjacency = edges.filter((e) => e.kind !== 'vertical').map((e) => ({ a: e.a, b: e.b }));
  const { areas, key } = buildKey(
    rooms, roomAdjacency, missionResult.entranceRoomId, config.key, links, doors
  );

  return {
    config,
    seed: config.seed,
    width: config.width,
    height: config.height,
    floors: config.floors,
    cells: grid,
    roomIdAt,
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

export { keyToMarkdown, validateDungeon, rasterizeRoom };
