// packages/core/src/stages/10-extract-walls.js
import { CELL, getCell, inBounds } from '../grid.js';

function isWalkable(value) {
  return value === CELL.ROOM || value === CELL.HALLWAY || value === CELL.STAIR;
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

function isDoorOpening(cellValue) {
  // HALLWAY is the common case. STAIR also counts: a VerticalLink footprint
  // is walkable (§5.2) and so — like a hallway — never shows up as a
  // silhouette wall transition against a room (both sides are walkable). A
  // room edge bordering a stair directly (no hallway cell in between) would
  // otherwise get neither a wall nor a door: a real gap in the geometry, and
  // the room would carry zero registered doors despite being reachable.
  return cellValue === CELL.HALLWAY || cellValue === CELL.STAIR;
}

/**
 * Doors are NOT a byproduct of the silhouette pass: a room's wall directly
 * adjoining a hallway (or stair — see isDoorOpening) has no walkability
 * transition (both sides are walkable), so it never appears as a silhouette
 * edge. This pass walks each room's rectangle perimeter directly and checks
 * the single cell immediately outside each boundary unit-cell.
 *
 * Each unit door-edge is traced to its destination room right here, before
 * fusion — a single wall can legitimately serve two side-by-side corridors
 * that lead to two *different* rooms (no wall between them, just contiguous
 * HALLWAY cells), and fusing those into one WallSegment would force one
 * `toRoomId` onto a door that really goes two places. `fuseGroup` folds
 * `roomId` and `toRoomId` into fuseRuns' grouping key so a run only fuses
 * when every cell in it agrees on both.
 */
function collectDoorEdges(grid, width, height, floor, rooms) {
  const horizontal = []; // door edge at row y, between (x,y-1) and (x,y)
  const vertical = [];   // door edge at column x, between (x-1,y) and (x,y)

  for (const room of rooms) {
    // North edge: outside cell is (x, room.y - 1)
    for (let x = room.x; x < room.x + room.w; x++) {
      const outside = { x, y: room.y - 1 };
      if (isDoorOpening(cellValueAt(grid, outside.x, outside.y, floor, width, height))) {
        const toRoomId = traceDestinationRoom(grid, width, height, floor, rooms, room.id, outside);
        horizontal.push({ x, y: room.y, roomId: room.id, toRoomId, fuseGroup: `${room.id}:${toRoomId}` });
      }
    }
    // South edge: outside cell is (x, room.y + room.h)
    for (let x = room.x; x < room.x + room.w; x++) {
      const outside = { x, y: room.y + room.h };
      if (isDoorOpening(cellValueAt(grid, outside.x, outside.y, floor, width, height))) {
        const toRoomId = traceDestinationRoom(grid, width, height, floor, rooms, room.id, outside);
        horizontal.push({ x, y: room.y + room.h, roomId: room.id, toRoomId, fuseGroup: `${room.id}:${toRoomId}` });
      }
    }
    // West edge: outside cell is (room.x - 1, y)
    for (let y = room.y; y < room.y + room.h; y++) {
      const outside = { x: room.x - 1, y };
      if (isDoorOpening(cellValueAt(grid, outside.x, outside.y, floor, width, height))) {
        const toRoomId = traceDestinationRoom(grid, width, height, floor, rooms, room.id, outside);
        vertical.push({ x: room.x, y, roomId: room.id, toRoomId, fuseGroup: `${room.id}:${toRoomId}` });
      }
    }
    // East edge: outside cell is (room.x + room.w, y)
    for (let y = room.y; y < room.y + room.h; y++) {
      const outside = { x: room.x + room.w, y };
      if (isDoorOpening(cellValueAt(grid, outside.x, outside.y, floor, width, height))) {
        const toRoomId = traceDestinationRoom(grid, width, height, floor, rooms, room.id, outside);
        vertical.push({ x: room.x + room.w, y, roomId: room.id, toRoomId, fuseGroup: `${room.id}:${toRoomId}` });
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

// Which side of its own room a door sits on — pure geometry, no grid walk.
function doorDirection(door, room) {
  if (door.y1 === door.y2) return door.y1 === room.y ? 'n' : 's';
  return door.x1 === room.x ? 'w' : 'e';
}

function roomAt(rooms, x, y) {
  return rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/**
 * Traces a door's corridor through the grid to whichever Room it actually
 * reaches — BFS (not DFS) so "nearest room" is deterministic and
 * order-independent, matching the rest of this stage's determinism.
 */
function traceDestinationRoom(grid, width, height, floor, rooms, originRoomId, start) {
  const startValue = cellValueAt(grid, start.x, start.y, floor, width, height);
  if (startValue === CELL.ROOM) {
    const r = roomAt(rooms, start.x, start.y);
    return r && r.id !== originRoomId ? r.id : null;
  }

  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !inBounds(nx, ny, floor, width, height, floor + 1)) continue;
      seen.add(key);

      const v = getCell(grid, nx, ny, floor, width, height);
      if (v === CELL.ROOM) {
        const r = roomAt(rooms, nx, ny);
        if (r && r.id !== originRoomId) return r.id;
        continue; // don't walk through a room's interior
      }
      if (v === CELL.HALLWAY || v === CELL.STAIR) queue.push({ x: nx, y: ny });
    }
  }
  return null; // no destination found — shouldn't happen in valid output
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

  function parseFuseGroup(group) {
    const sep = group.indexOf(':');
    const roomId = Number(group.slice(0, sep));
    const toRoomIdStr = group.slice(sep + 1);
    return { roomId, toRoomId: toRoomIdStr === 'null' ? null : Number(toRoomIdStr) };
  }

  const hDoorSegments = fuseRuns(doorEdges.horizontal, 'y', 'x', 'fuseGroup').map((s) => ({
    floor, x1: s.start, y1: s.axis, x2: s.end, y2: s.axis, isDoor: true, doorId: null, ...parseFuseGroup(s.group),
  }));
  const vDoorSegments = fuseRuns(doorEdges.vertical, 'x', 'y', 'fuseGroup').map((s) => ({
    floor, x1: s.axis, y1: s.start, x2: s.axis, y2: s.end, isDoor: true, doorId: null, ...parseFuseGroup(s.group),
  }));

  const doorWalls = [...hDoorSegments, ...vDoorSegments];

  const roomsById = new Map(rooms.map((r) => [r.id, r]));

  let nextDoorId = 0;
  const doors = [];
  for (const wall of doorWalls) {
    const doorId = nextDoorId++;
    wall.doorId = doorId;
    const room = roomsById.get(wall.roomId);
    doors.push({
      id: doorId,
      floor,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      roomId: wall.roomId,
      secret: false,
      dir: doorDirection(wall, room),
      toRoomId: wall.toRoomId,
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

  const publicDoorWalls = doorWalls.map(({ roomId, toRoomId, ...rest }) => rest);
  const walls = [...hWalls, ...vWalls, ...publicDoorWalls];

  return { walls, doors };
}
