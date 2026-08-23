// packages/core/src/stages/10-extract-walls.js
import { CELL, getCell, inBounds, isWalkable } from '../grid.js';

function isDoorNeighbor(value) {
  return value === CELL.HALLWAY || value === CELL.STAIR;
}

function cellValueAt(grid, x, y, floor, width, height) {
  if (!inBounds(x, y, floor, width, height, floor + 1)) return CELL.EMPTY;
  return getCell(grid, x, y, floor, width, height);
}

function collectSilhouetteEdges(grid, width, height, floor) {
  const horizontal = [];
  const vertical = [];

  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      const above = cellValueAt(grid, x, y - 1, floor, width, height);
      const below = cellValueAt(grid, x, y, floor, width, height);
      if (isWalkable(above) !== isWalkable(below)) {
        horizontal.push({ x, y });
      }
    }
  }

  for (let x = 0; x <= width; x++) {
    for (let y = 0; y < height; y++) {
      const left = cellValueAt(grid, x - 1, y, floor, width, height);
      const right = cellValueAt(grid, x, y, floor, width, height);
      if (isWalkable(left) !== isWalkable(right)) {
        vertical.push({ x, y });
      }
    }
  }

  return { horizontal, vertical };
}

/**
 * Doors are NOT a byproduct of the silhouette pass: a room's wall directly
 * adjoining a hallway has no walkability transition (both are walkable), so
 * it never appears as a silhouette edge. This pass walks each room's
 * rectangle perimeter directly and checks the single cell immediately
 * outside each boundary unit-cell.
 */
function collectDoorEdges(grid, width, height, floor, rooms) {
  const horizontal = []; // door edge at row y, between (x,y-1) and (x,y)
  const vertical = [];   // door edge at column x, between (x-1,y) and (x,y)

  for (const room of rooms) {
    // North edge: outside cell is (x, room.y - 1)
    for (let x = room.x; x < room.x + room.w; x++) {
      if (isDoorNeighbor(cellValueAt(grid, x, room.y - 1, floor, width, height))) {
        horizontal.push({ x, y: room.y, roomId: room.id });
      }
    }
    // South edge: outside cell is (x, room.y + room.h)
    for (let x = room.x; x < room.x + room.w; x++) {
      if (isDoorNeighbor(cellValueAt(grid, x, room.y + room.h, floor, width, height))) {
        horizontal.push({ x, y: room.y + room.h, roomId: room.id });
      }
    }
    // West edge: outside cell is (room.x - 1, y)
    for (let y = room.y; y < room.y + room.h; y++) {
      if (isDoorNeighbor(cellValueAt(grid, room.x - 1, y, floor, width, height))) {
        vertical.push({ x: room.x, y, roomId: room.id });
      }
    }
    // East edge: outside cell is (room.x + room.w, y)
    for (let y = room.y; y < room.y + room.h; y++) {
      if (isDoorNeighbor(cellValueAt(grid, room.x + room.w, y, floor, width, height))) {
        vertical.push({ x: room.x + room.w, y, roomId: room.id });
      }
    }
  }

  return { horizontal, vertical };
}

/**
 * Fuses colinear contiguous unit edges into single segments. `groupKey`
 * (e.g. 'roomId') additionally splits runs whenever the group changes, so
 * two different rooms' door edges never fuse into one segment even if they
 * happen to be positionally adjacent.
 */
function fuseRuns(edges, axisKey, positionKey, groupKey) {
  const segments = [];
  let run = null;

  for (const edge of edges) {
    const group = groupKey ? edge[groupKey] : undefined;
    if (
      run &&
      run.axis === edge[axisKey] &&
      run.group === group &&
      edge[positionKey] === run.end
    ) {
      run.end = edge[positionKey] + 1;
    } else {
      if (run) segments.push(run);
      run = { axis: edge[axisKey], start: edge[positionKey], end: edge[positionKey] + 1, group };
    }
  }
  if (run) segments.push(run);
  return segments;
}

/**
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {import('../types.js').Room[]} rooms
 */
export function extractWalls(grid, width, height, floor, rooms) {
  const silhouette = collectSilhouetteEdges(grid, width, height, floor);
  silhouette.horizontal.sort((a, b) => a.y - b.y || a.x - b.x);
  silhouette.vertical.sort((a, b) => a.x - b.x || a.y - b.y);

  const hWalls = fuseRuns(silhouette.horizontal, 'y', 'x', null).map((s) => ({
    floor, x1: s.start, y1: s.axis, x2: s.end, y2: s.axis, isDoor: false, doorId: null,
  }));
  const vWalls = fuseRuns(silhouette.vertical, 'x', 'y', null).map((s) => ({
    floor, x1: s.axis, y1: s.start, x2: s.axis, y2: s.end, isDoor: false, doorId: null,
  }));

  const doorEdges = collectDoorEdges(grid, width, height, floor, rooms);
  doorEdges.horizontal.sort((a, b) => a.y - b.y || a.x - b.x);
  doorEdges.vertical.sort((a, b) => a.x - b.x || a.y - b.y);

  const hDoorSegments = fuseRuns(doorEdges.horizontal, 'y', 'x', 'roomId').map((s) => ({
    floor, x1: s.start, y1: s.axis, x2: s.end, y2: s.axis, isDoor: true, doorId: null, roomId: s.group,
  }));
  const vDoorSegments = fuseRuns(doorEdges.vertical, 'x', 'y', 'roomId').map((s) => ({
    floor, x1: s.axis, y1: s.start, x2: s.axis, y2: s.end, isDoor: true, doorId: null, roomId: s.group,
  }));

  const doorWalls = [...hDoorSegments, ...vDoorSegments];

  let nextDoorId = 0;
  const doors = [];
  for (const wall of doorWalls) {
    const doorId = nextDoorId++;
    wall.doorId = doorId;
    doors.push({
      id: doorId,
      floor,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      roomId: wall.roomId,
      secret: false,
    });
  }

  const doorsByRoom = new Map();
  for (const d of doors) {
    if (!doorsByRoom.has(d.roomId)) doorsByRoom.set(d.roomId, []);
    doorsByRoom.get(d.roomId).push(d.id);
  }
  for (const room of rooms) {
    room.doors = doorsByRoom.get(room.id) ?? [];
  }

  const publicDoorWalls = doorWalls.map(({ roomId, ...rest }) => rest);
  const walls = [...hWalls, ...vWalls, ...publicDoorWalls];

  return { walls, doors };
}
