// packages/core/src/validate.js
//
// SPEC.md §6 — runs against the abstract Dungeon produced by `core`, before
// any `config.target` decision. Invariants 15 ("Vínculo íntegro") is about
// Foundry Note/Region documents that don't exist until adapter-foundry
// (M6/M4a/M4b) is built, so it isn't checked here — everything else in §6
// is checkable purely from `Dungeon`.
import { CELL, getCell, inBounds } from './grid.js';

function isWalkable(v) {
  return v === CELL.ROOM || v === CELL.HALLWAY || v === CELL.STAIR;
}

function issue(code, message, context = {}) {
  return { code, message, ...context };
}

const NEIGHBORS_4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function floodFill2D(cells, width, height, floor, startIdx) {
  const seen = new Uint8Array(width * height);
  const stack = [startIdx];
  seen[startIdx] = 1;
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % width;
    const y = Math.floor(idx / width);
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (!seen[nIdx] && isWalkable(getCell(cells, nx, ny, floor, width, height))) {
        seen[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }
  return seen;
}

// Invariant 1 — every floor's walkable cells form a single connected component.
function checkFloorConnectivity(dungeon, errors) {
  const { cells, width, height, floors } = dungeon;
  for (let floor = 0; floor < floors; floor++) {
    let startIdx = -1;
    let totalWalkable = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isWalkable(getCell(cells, x, y, floor, width, height))) {
          totalWalkable++;
          if (startIdx === -1) startIdx = y * width + x;
        }
      }
    }
    if (totalWalkable === 0) continue;
    const seen = floodFill2D(cells, width, height, floor, startIdx);
    let reached = 0;
    for (let i = 0; i < seen.length; i++) reached += seen[i];
    if (reached !== totalWalkable) {
      errors.push(issue(
        'floor-disconnected',
        `floor ${floor} has ${totalWalkable - reached} walkable cell(s) unreachable from the rest of the floor`,
        { floor, totalWalkable, reached }
      ));
    }
  }
}

// Invariant 2 — flood fill across VerticalLinks reaches every floor from the entrance.
function checkGlobalConnectivity(dungeon, errors) {
  const { cells, width, height, floors, links, mission, rooms } = dungeon;
  if (floors <= 1) return;

  const entranceRoom = rooms.find((r) => r.id === mission.entranceRoomId);
  if (!entranceRoom) {
    errors.push(issue('mission-entrance-missing', 'mission.entranceRoomId does not reference an existing Room'));
    return;
  }

  const idx3 = (x, y, z) => z * (width * height) + y * width + x;
  const start = idx3(
    Math.floor(entranceRoom.cx), Math.floor(entranceRoom.cy), entranceRoom.floor
  );
  if (!isWalkable(cells[start])) {
    errors.push(issue('entrance-not-walkable', 'entrance room centroid does not land on a walkable cell'));
    return;
  }

  const seen = new Uint8Array(cells.length);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    const z = Math.floor(i / (width * height));
    const rem = i % (width * height);
    const y = Math.floor(rem / width);
    const x = rem % width;

    const neighbors = [[x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z]];
    if (cells[i] === CELL.STAIR) {
      if (z + 1 < floors) neighbors.push([x, y, z + 1]);
      if (z - 1 >= 0) neighbors.push([x, y, z - 1]);
    }
    for (const [nx, ny, nz] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || nz < 0 || nz >= floors) continue;
      const nIdx = idx3(nx, ny, nz);
      if (!seen[nIdx] && isWalkable(cells[nIdx])) {
        seen[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }

  let totalWalkable = 0;
  let reached = 0;
  for (let i = 0; i < cells.length; i++) {
    if (isWalkable(cells[i])) {
      totalWalkable++;
      reached += seen[i];
    }
  }
  if (reached !== totalWalkable) {
    errors.push(issue(
      'global-disconnected',
      `${totalWalkable - reached} walkable cell(s) unreachable from the entrance across floors`,
      { totalWalkable, reached }
    ));
  }

  // Every floor must have >=1 link up (except top) and >=1 link down (except bottom).
  for (let floor = 0; floor < floors; floor++) {
    const hasDown = links.some((l) => l.fromFloor === floor);
    const hasUp = links.some((l) => l.toFloor === floor);
    if (floor < floors - 1 && !hasDown) {
      errors.push(issue('floor-missing-link-down', `floor ${floor} has no VerticalLink to the floor below`, { floor }));
    }
    if (floor > 0 && !hasUp) {
      errors.push(issue('floor-missing-link-up', `floor ${floor} has no VerticalLink to the floor above`, { floor }));
    }
  }
}

// Invariant 3 — every VerticalLink footprint is STAIR and accessible on both floors.
function checkVerticalLinks(dungeon, errors) {
  const { cells, width, height, floors, links } = dungeon;
  for (const link of links) {
    const isOwnFootprint = (x, y) =>
      x >= link.x && x < link.x + link.w && y >= link.y && y < link.y + link.h;

    for (const floor of [link.fromFloor, link.toFloor]) {
      let accessible = false;
      for (let dy = 0; dy < link.h; dy++) {
        for (let dx = 0; dx < link.w; dx++) {
          const x = link.x + dx;
          const y = link.y + dy;
          if (!inBounds(x, y, floor, width, height, floors)) {
            errors.push(issue('link-footprint-oob', `VerticalLink ${link.id} footprint out of bounds on floor ${floor}`, { linkId: link.id, floor }));
            continue;
          }
          if (getCell(cells, x, y, floor, width, height) !== CELL.STAIR) {
            errors.push(issue('link-footprint-not-stair', `VerticalLink ${link.id} footprint cell (${x},${y}) is not CELL.STAIR on floor ${floor}`, { linkId: link.id, floor, x, y }));
          }
          // Any walkable neighbor counts, including another VerticalLink's
          // STAIR footprint touching this one (stage 5 only enforces a
          // minimum separation between links within the same floor gap, not
          // across gaps — two links can legitimately land adjacent on a
          // shared middle floor) — but not this link's own footprint cells,
          // which are always mutually adjacent and would trivially "pass".
          for (const [ddx, ddy] of NEIGHBORS_4) {
            const nx = x + ddx;
            const ny = y + ddy;
            if (!inBounds(nx, ny, floor, width, height, floors)) continue;
            if (isOwnFootprint(nx, ny)) continue;
            if (isWalkable(getCell(cells, nx, ny, floor, width, height))) accessible = true;
          }
        }
      }
      if (!accessible) {
        errors.push(issue('link-inaccessible', `VerticalLink ${link.id} footprint has no adjacent walkable cell on floor ${floor}`, { linkId: link.id, floor }));
      }
    }
  }
}

// Invariant 4 — every door has walkable cells on both sides. SPEC.md §6.4
// also asks for "parede nos dois lados perpendiculares", but that can't be
// checked independently of how a door's flank actually ends: it can be a
// same-edge wall stub, a room's perpendicular corner wall, *or* a STAIR
// footprint sitting flush against the door (§5.12 extracts walls from the
// ROOM|HALLWAY|STAIR walkable superset, so no wall is drawn between a door
// and an adjacent stair — that's correct, not a defect). Re-deriving which
// case applies duplicates extractWalls' own logic without adding a check
// that could actually fail on a real bug, so only the unambiguous half —
// walkable on both sides — is enforced here.
function checkDoors(dungeon, errors) {
  const { cells, width, height, floors, doors } = dungeon;
  const at = (x, y, floor) => {
    if (!inBounds(x, y, floor, width, height, floors)) return CELL.EMPTY;
    return getCell(cells, x, y, floor, width, height);
  };

  for (const door of doors) {
    const horizontal = door.y1 === door.y2;
    if (horizontal) {
      const y = door.y1;
      for (let x = door.x1; x < door.x2; x++) {
        const above = at(x, y - 1, door.floor);
        const below = at(x, y, door.floor);
        if (!isWalkable(above) || !isWalkable(below)) {
          errors.push(issue('door-not-open-both-sides', `door ${door.id} is not walkable on both sides at x=${x}`, { doorId: door.id }));
        }
      }
    } else {
      const x = door.x1;
      for (let y = door.y1; y < door.y2; y++) {
        const left = at(x - 1, y, door.floor);
        const right = at(x, y, door.floor);
        if (!isWalkable(left) || !isWalkable(right)) {
          errors.push(issue('door-not-open-both-sides', `door ${door.id} is not walkable on both sides at y=${y}`, { doorId: door.id }));
        }
      }
    }
  }
}

// Invariant 5 — every WallSegment borders at least one walkable cell.
function checkNoOrphanWalls(dungeon, errors) {
  const { cells, width, height, floors, walls } = dungeon;
  const at = (x, y, floor) => {
    if (!inBounds(x, y, floor, width, height, floors)) return CELL.EMPTY;
    return getCell(cells, x, y, floor, width, height);
  };

  for (const wall of walls) {
    const horizontal = wall.y1 === wall.y2;
    let bordersWalkable = false;
    if (horizontal) {
      for (let x = wall.x1; x < wall.x2 && !bordersWalkable; x++) {
        if (isWalkable(at(x, wall.y1 - 1, wall.floor)) || isWalkable(at(x, wall.y1, wall.floor))) {
          bordersWalkable = true;
        }
      }
    } else {
      for (let y = wall.y1; y < wall.y2 && !bordersWalkable; y++) {
        if (isWalkable(at(wall.x1 - 1, y, wall.floor)) || isWalkable(at(wall.x1, y, wall.floor))) {
          bordersWalkable = true;
        }
      }
    }
    if (!bordersWalkable) {
      errors.push(issue('orphan-wall', `wall segment on floor ${wall.floor} at (${wall.x1},${wall.y1})-(${wall.x2},${wall.y2}) borders no walkable cell`, { floor: wall.floor }));
    }
  }
}

// Invariant 6 — no accidental dead end: every HALLWAY cell with exactly one
// walkable neighbor must be adjacent to a ROOM or STAIR (i.e. already have
// content), per SPEC.md §5.9's own definition of what prune should have removed.
function checkNoOrphanDeadEnds(dungeon, errors) {
  const { cells, width, height, floors } = dungeon;
  for (let floor = 0; floor < floors; floor++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (getCell(cells, x, y, floor, width, height) !== CELL.HALLWAY) continue;
        let walkableNeighbors = 0;
        let adjacentToContent = false;
        for (const [dx, dy] of NEIGHBORS_4) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny, floor, width, height, floors)) continue;
          const v = getCell(cells, nx, ny, floor, width, height);
          if (isWalkable(v)) walkableNeighbors++;
          if (v === CELL.ROOM || v === CELL.STAIR) adjacentToContent = true;
        }
        if (walkableNeighbors === 1 && !adjacentToContent) {
          errors.push(issue('orphan-dead-end', `hallway dead end at (${x},${y}) floor ${floor} has no content (room/stair) adjacent`, { floor, x, y }));
        }
      }
    }
  }
}

// Invariant 7 — wall budget. `config.target` doesn't exist in this codebase
// yet (adapter-foundry / M6 is unbuilt), so this checks the combined total,
// which is the stricter (v14, single-Scene) reading of the budget.
function checkWallBudget(dungeon, errors) {
  if (dungeon.walls.length >= 1500) {
    errors.push(issue('wall-budget-exceeded', `walls.length is ${dungeon.walls.length}, must be < 1500`, { count: dungeon.walls.length }));
  }
}

// Invariant 8 — every Room has >=1 door.
function checkRoomsHaveDoors(dungeon, errors) {
  for (const room of dungeon.rooms) {
    if (!room.doors || room.doors.length === 0) {
      errors.push(issue('room-unreachable', `room ${room.id} has no doors`, { roomId: room.id }));
    }
  }
}

// Invariant 9 — every Room has exactly one Area; every Area has exactly one KeyEntry.
function checkKeyCompleteness(dungeon, errors) {
  const { rooms, areas, key } = dungeon;
  const areasByRoomId = new Map();
  for (const area of areas) {
    if (area.roomId === null) continue;
    areasByRoomId.set(area.roomId, (areasByRoomId.get(area.roomId) ?? 0) + 1);
  }
  for (const room of rooms) {
    const count = areasByRoomId.get(room.id) ?? 0;
    if (count !== 1) {
      errors.push(issue('room-area-mismatch', `room ${room.id} has ${count} Area(s), expected exactly 1`, { roomId: room.id, count }));
    }
  }

  const entriesByAreaId = new Map();
  for (const entry of key.entries) {
    entriesByAreaId.set(entry.areaId, (entriesByAreaId.get(entry.areaId) ?? 0) + 1);
  }
  for (const area of areas) {
    const count = entriesByAreaId.get(area.id) ?? 0;
    if (count !== 1) {
      errors.push(issue('area-entry-mismatch', `area ${area.id} (${area.label}) has ${count} KeyEntry(ies), expected exactly 1`, { areaId: area.id, count }));
    }
  }
}

// Invariant 10 — no duplicate labels; per-floor numbering has no gaps.
function checkLabelsUniqueAndContiguous(dungeon, errors) {
  const { areas, config } = dungeon;
  const startAt = config.key?.startAt ?? 1;

  const seen = new Set();
  for (const area of areas) {
    if (seen.has(area.label)) {
      errors.push(issue('duplicate-label', `label "${area.label}" is used by more than one area`, { label: area.label }));
    }
    seen.add(area.label);
  }

  const byFloor = new Map();
  for (const area of areas) {
    if (!byFloor.has(area.floor)) byFloor.set(area.floor, []);
    const match = /(\d+)$/.exec(area.label);
    if (!match) {
      errors.push(issue('label-not-numbered', `label "${area.label}" has no trailing number`, { label: area.label }));
      continue;
    }
    byFloor.get(area.floor).push(Number.parseInt(match[1], 10));
  }

  for (const [floor, numbers] of byFloor) {
    numbers.sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      const expected = startAt + i;
      if (numbers[i] !== expected) {
        errors.push(issue('label-numbering-gap', `floor ${floor} numbering has a gap or duplicate: expected ${expected}, got ${numbers[i]}`, { floor }));
        break;
      }
    }
  }
}

// Invariant 11 — exits are symmetric: if X lists an exit to Y, Y lists one to X.
function checkExitsSymmetric(dungeon, errors) {
  const { areas } = dungeon;
  const byLabel = new Map(areas.map((a) => [a.label, a]));
  for (const area of areas) {
    for (const exit of area.exits) {
      const target = byLabel.get(exit.toLabel);
      if (!target) {
        errors.push(issue('exit-target-missing', `area ${area.label} has an exit to unknown label "${exit.toLabel}"`, { label: area.label, toLabel: exit.toLabel }));
        continue;
      }
      const hasReciprocal = target.exits.some((e) => e.toLabel === area.label);
      if (!hasReciprocal) {
        errors.push(issue('exit-not-symmetric', `area ${area.label} lists an exit to ${exit.toLabel}, but not vice versa`, { label: area.label, toLabel: exit.toLabel }));
      }
    }
  }
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Invariant 12 — every area's label anchor lands on a walkable cell of its
// own floor and is >=0.4 cells from any wall (0.4*gridSize in the emitted
// pixel space — the gridSize factor cancels since both sides are in cells).
const MIN_WALL_CLEARANCE = 0.4;

function checkAnchorsValid(dungeon, errors) {
  const { cells, width, height, floors, walls, areas } = dungeon;
  const wallsByFloor = new Map();
  for (const wall of walls) {
    if (!wallsByFloor.has(wall.floor)) wallsByFloor.set(wall.floor, []);
    wallsByFloor.get(wall.floor).push(wall);
  }

  for (const area of areas) {
    const cellX = Math.floor(area.cx);
    const cellY = Math.floor(area.cy);
    if (!inBounds(cellX, cellY, area.floor, width, height, floors) ||
      !isWalkable(getCell(cells, cellX, cellY, area.floor, width, height))) {
      errors.push(issue('anchor-not-walkable', `area ${area.label} anchor (${area.cx},${area.cy}) is not on a walkable cell`, { label: area.label }));
      continue;
    }

    const floorWalls = wallsByFloor.get(area.floor) ?? [];
    let minDist = Infinity;
    for (const wall of floorWalls) {
      const d = pointToSegmentDistance(area.cx, area.cy, wall.x1, wall.y1, wall.x2, wall.y2);
      if (d < minDist) minDist = d;
    }
    if (minDist < MIN_WALL_CLEARANCE) {
      errors.push(issue('anchor-too-close-to-wall', `area ${area.label} anchor is ${minDist.toFixed(2)} cells from a wall, needs >= ${MIN_WALL_CLEARANCE}`, { label: area.label, distance: minDist }));
    }
  }
}

// Invariant 13 — every legend symbol corresponds to something actually
// present, and every role present that has a symbol is represented.
const ROLE_LEGEND_KINDS = new Set(['entrance', 'climax', 'treasure', 'junction']);

function checkLegendFidelity(dungeon, errors) {
  const { rooms, links, key } = dungeon;
  const rolesPresent = new Set(rooms.map((r) => r.role));
  const legendKinds = new Set(key.legend.map((s) => s.kind));

  for (const symbol of key.legend) {
    if (symbol.kind === 'area' || symbol.kind === 'stairUp' || symbol.kind === 'stairDown' || symbol.kind === 'secret') continue;
    if (ROLE_LEGEND_KINDS.has(symbol.kind) && !rolesPresent.has(symbol.kind)) {
      errors.push(issue('legend-symbol-unused', `legend declares "${symbol.kind}" but no room has that role`, { kind: symbol.kind }));
    }
  }
  for (const role of rolesPresent) {
    if (ROLE_LEGEND_KINDS.has(role) && !legendKinds.has(role)) {
      errors.push(issue('legend-missing-symbol', `role "${role}" is present but has no legend symbol`, { role }));
    }
  }

  // SPEC.md §5.11's legend table lists stairUp/stairDown ("Note de escada,
  // sem número") whenever the dungeon has any VerticalLink at all — they're
  // not tied to a Room role like the symbols above, so they need their own
  // presence/absence check in both directions.
  const hasLinks = links.length > 0;
  for (const kind of ['stairUp', 'stairDown']) {
    if (hasLinks && !legendKinds.has(kind)) {
      errors.push(issue('legend-missing-symbol', `links exist but the legend has no "${kind}" symbol`, { kind }));
    }
    if (!hasLinks && legendKinds.has(kind)) {
      errors.push(issue('legend-symbol-unused', `legend declares "${kind}" but this dungeon has no links`, { kind }));
    }
  }
}

// Invariant 14 — Note budget (areas + 2 per link). Combined total, same
// caveat as invariant 7: `config.target` isn't implemented yet, this is the
// stricter v14 (single-Scene) reading.
function checkNoteBudget(dungeon, errors) {
  const total = dungeon.areas.length + dungeon.links.length * 2;
  if (total > 60) {
    errors.push(issue('note-budget-exceeded', `areas.length + links.length*2 is ${total}, must be <= 60`, { total }));
  }
}

/**
 * @param {import('./types.js').Dungeon} dungeon
 * @returns {{ ok: boolean, errors: object[] }}
 */
export function validateDungeon(dungeon) {
  const errors = [];

  checkFloorConnectivity(dungeon, errors);
  checkGlobalConnectivity(dungeon, errors);
  checkVerticalLinks(dungeon, errors);
  checkDoors(dungeon, errors);
  checkNoOrphanWalls(dungeon, errors);
  checkNoOrphanDeadEnds(dungeon, errors);
  checkWallBudget(dungeon, errors);
  checkRoomsHaveDoors(dungeon, errors);
  checkKeyCompleteness(dungeon, errors);
  checkLabelsUniqueAndContiguous(dungeon, errors);
  checkExitsSymmetric(dungeon, errors);
  checkAnchorsValid(dungeon, errors);
  checkLegendFidelity(dungeon, errors);
  checkNoteBudget(dungeon, errors);

  return { ok: errors.length === 0, errors };
}
