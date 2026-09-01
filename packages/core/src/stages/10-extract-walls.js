// packages/core/src/stages/10-extract-walls.js
import { CELL, getCell, getRoomId, inBounds, NO_ROOM } from '../grid.js';

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

const DOOR_NEIGHBORS = [
  { dx: 0, dy: -1, dir: 'n' },
  { dx: 0, dy: 1, dir: 's' },
  { dx: -1, dy: 0, dir: 'w' },
  { dx: 1, dy: 0, dir: 'e' },
];

function roomIdAtCell(roomIdAt, x, y, floor, width, height) {
  if (!inBounds(x, y, floor, width, height, floor + 1)) return null;
  const id = getRoomId(roomIdAt, x, y, floor, width, height);
  return id === NO_ROOM ? null : id;
}

/**
 * Doors are NOT a byproduct of the silhouette pass: a room's wall directly
 * adjoining a hallway (or stair — see isDoorOpening) has no walkability
 * transition (both sides are walkable), so it never appears as a silhouette
 * edge. This pass walks every cell that actually belongs to each room (via
 * roomIdAt — the room's real shape, not its bounding box) and checks each of
 * its 4 neighbors: any neighbor outside the room's own cell membership that
 * is a door-opening is a candidate door edge, in the direction of that
 * neighbor. Sweeping the room's bounding box and skipping non-member cells
 * (rather than trying to walk just the perimeter directly) keeps this
 * correct for concave shapes (L, cross) where the "perimeter" isn't a single
 * simple loop — an inner concave wall is found the same way as an outer one.
 */
function collectDoorEdges(grid, roomIdAt, width, height, floor, rooms) {
  const horizontal = []; // door edge at row y, between (x,y-1) and (x,y)
  const vertical = [];   // door edge at column x, between (x-1,y) and (x,y)

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (roomIdAtCell(roomIdAt, x, y, floor, width, height) !== room.id) continue;

        for (const { dx, dy, dir } of DOOR_NEIGHBORS) {
          const ox = x + dx;
          const oy = y + dy;
          if (roomIdAtCell(roomIdAt, ox, oy, floor, width, height) === room.id) continue;

          const outsideValue = cellValueAt(grid, ox, oy, floor, width, height);
          if (!isDoorOpening(outsideValue)) continue;

          const toRoomId = traceDestinationRoom(grid, roomIdAt, width, height, floor, room.id, { x: ox, y: oy });
          const fuseGroup = `${room.id}:${toRoomId}:${dir}`;

          if (dir === 'n' || dir === 's') {
            horizontal.push({ x, y: dir === 's' ? y + 1 : y, roomId: room.id, toRoomId, fuseGroup });
          } else {
            vertical.push({ x: dir === 'e' ? x + 1 : x, y, roomId: room.id, toRoomId, fuseGroup });
          }
        }
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
 * Traces a door's corridor through the grid to whichever Room it actually
 * reaches — BFS (not DFS) so "nearest room" is deterministic and
 * order-independent, matching the rest of this stage's determinism.
 */
function traceDestinationRoom(grid, roomIdAt, width, height, floor, originRoomId, start) {
  const startValue = cellValueAt(grid, start.x, start.y, floor, width, height);
  if (startValue === CELL.ROOM) {
    const id = roomIdAtCell(roomIdAt, start.x, start.y, floor, width, height);
    return id !== null && id !== originRoomId ? id : null;
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
        const id = roomIdAtCell(roomIdAt, nx, ny, floor, width, height);
        if (id !== null && id !== originRoomId) return id;
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
export function extractWalls(grid, roomIdAt, width, height, floor, rooms) {
  const silhouette = collectSilhouetteEdges(grid, width, height, floor);
  silhouette.horizontal.sort((a, b) => a.y - b.y || a.x - b.x);
  silhouette.vertical.sort((a, b) => a.x - b.x || a.y - b.y);

  const hWalls = fuseRuns(silhouette.horizontal, 'y', 'x', null).map((s) => ({
    floor, x1: s.start, y1: s.axis, x2: s.end, y2: s.axis, isDoor: false, doorId: null,
  }));
  const vWalls = fuseRuns(silhouette.vertical, 'x', 'y', null).map((s) => ({
    floor, x1: s.axis, y1: s.start, x2: s.axis, y2: s.end, isDoor: false, doorId: null,
  }));

  const doorEdges = collectDoorEdges(grid, roomIdAt, width, height, floor, rooms);
  doorEdges.horizontal.sort((a, b) => a.y - b.y || a.x - b.x);
  doorEdges.vertical.sort((a, b) => a.x - b.x || a.y - b.y);

  function parseFuseGroup(group) {
    const [roomIdStr, toRoomIdStr, dir] = group.split(':');
    return { roomId: Number(roomIdStr), toRoomId: toRoomIdStr === 'null' ? null : Number(toRoomIdStr), dir };
  }

  const hDoorSegments = fuseRuns(doorEdges.horizontal, 'y', 'x', 'fuseGroup').map((s) => ({
    floor, x1: s.start, y1: s.axis, x2: s.end, y2: s.axis, isDoor: true, doorId: null, ...parseFuseGroup(s.group),
  }));
  const vDoorSegments = fuseRuns(doorEdges.vertical, 'x', 'y', 'fuseGroup').map((s) => ({
    floor, x1: s.axis, y1: s.start, x2: s.axis, y2: s.end, isDoor: true, doorId: null, ...parseFuseGroup(s.group),
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
      dir: wall.dir,
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

  const publicDoorWalls = doorWalls.map(({ roomId, toRoomId, dir, ...rest }) => rest);
  const walls = [...hWalls, ...vWalls, ...publicDoorWalls];

  return { walls, doors };
}
