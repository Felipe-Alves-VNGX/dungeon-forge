// packages/core/src/validate.js
//
// SPEC.md §6 — 15 invariants over the abstract Dungeon model, checked before
// `emit`/adapter-foundry ever runs. Deliberately doesn't read config.target —
// see the M6 plan notes for why #7 and #14 (phrased per-target in SPEC) are
// safe to check as a single global bound regardless of target, and why #12
// doesn't need config.gridSize.
import { CELL, getCell, inBounds } from './grid.js';

const DIRS4 = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

function isWalkable(v) {
  return v === CELL.ROOM || v === CELL.HALLWAY || v === CELL.STAIR;
}

function push(errors, rule, message, floor) {
  errors.push(floor === undefined ? { rule, message } : { rule, message, floor });
}

// --- #1 Per-floor connectivity ---------------------------------------------
function checkRule1(dungeon, errors) {
  const { cells, width, height, floors } = dungeon;
  for (let floor = 0; floor < floors; floor++) {
    let start = null;
    let total = 0;
    for (let y = 0; y < height && !start; y++) {
      for (let x = 0; x < width; x++) {
        if (isWalkable(getCell(cells, x, y, floor, width, height))) {
          start = { x, y };
          break;
        }
      }
    }
    if (!start) continue; // no walkable cells on this floor — nothing to connect

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isWalkable(getCell(cells, x, y, floor, width, height))) total++;
      }
    }

    const seen = new Set([`${start.x},${start.y}`]);
    const stack = [start];
    while (stack.length) {
      const { x, y } = stack.pop();
      for (const { dx, dy } of DIRS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        if (isWalkable(getCell(cells, nx, ny, floor, width, height))) {
          seen.add(key);
          stack.push({ x: nx, y: ny });
        }
      }
    }

    if (seen.size !== total) {
      push(errors, 1, `floor ${floor}: only ${seen.size}/${total} walkable cells are reachable from each other`, floor);
    }
  }
}

// --- #2 Global connectivity --------------------------------------------------
function checkRule2(dungeon, errors) {
  const { rooms = [], edges = [], floors = 1, mission: missionResult } = dungeon;
  if (!missionResult || missionResult.entranceRoomId === undefined) return;

  const adj = new Map(rooms.map((r) => [r.id, []]));
  for (const e of edges) {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  }

  const seen = new Set([missionResult.entranceRoomId]);
  const queue = [missionResult.entranceRoomId];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const reachedFloors = new Set([...seen].map((id) => roomsById.get(id)?.floor));
  for (let floor = 0; floor < floors; floor++) {
    if (!reachedFloors.has(floor)) {
      push(errors, 2, `floor ${floor} is not reachable from the entrance via any edge chain`, floor);
    }
  }
}

// --- #3 Paired, accessible stairs --------------------------------------------
function checkRule3(dungeon, errors) {
  const { cells, width, height, links = [] } = dungeon;
  for (const link of links) {
    for (const [floor, label] of [[link.fromFloor, 'fromFloor'], [link.toFloor, 'toFloor']]) {
      let allStair = true;
      let hasCarvedNeighbor = false;
      for (let dy = 0; dy < link.h; dy++) {
        for (let dx = 0; dx < link.w; dx++) {
          const x = link.x + dx;
          const y = link.y + dy;
          if (!inBounds(x, y, floor, width, height, floor + 1) || getCell(cells, x, y, floor, width, height) !== CELL.STAIR) {
            allStair = false;
          }
          for (const d of DIRS4) {
            const nx = x + d.dx;
            const ny = y + d.dy;
            if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
            const v = getCell(cells, nx, ny, floor, width, height);
            if (v === CELL.ROOM || v === CELL.HALLWAY) hasCarvedNeighbor = true;
          }
        }
      }
      if (!allStair) {
        push(errors, 3, `VerticalLink ${link.id}: footprint is not fully CELL.STAIR on ${label} (floor ${floor})`, floor);
      }
      if (!hasCarvedNeighbor) {
        push(errors, 3, `VerticalLink ${link.id}: footprint on floor ${floor} isn't carved into (unreachable)`, floor);
      }
    }
  }
}

// --- #4 Well-formed doors -----------------------------------------------------
// A wall touching a door's jamb doesn't necessarily have an ENDPOINT exactly at
// the door's corner — fuseRuns() fuses collinear contiguous silhouette walls
// regardless of which room "owns" each unit-cell, so a wall bounding this door
// may run straight through that point as part of a longer fused segment. Check
// span coverage, not endpoint equality.
function wallCoversPoint(walls, floor, x, y, perpendicularAxis) {
  return walls.some((w) => {
    if (w.floor !== floor) return false;
    const isVertical = w.x1 === w.x2;
    if (perpendicularAxis === 'vertical' && !isVertical) return false;
    if (perpendicularAxis === 'horizontal' && isVertical) return false;
    if (isVertical) return w.x1 === x && y >= w.y1 && y <= w.y2;
    return w.y1 === y && x >= w.x1 && x <= w.x2;
  });
}

function checkRule4(dungeon, errors) {
  const { cells, width, height, doors = [], walls = [] } = dungeon;
  for (const door of doors) {
    const horizontal = door.y1 === door.y2;
    const start = horizontal ? door.x1 : door.y1;
    const end = horizontal ? door.x2 : door.y2;
    const fixed = horizontal ? door.y1 : door.x1;

    for (let p = start; p < end; p++) {
      const [sideAx, sideAy, sideBx, sideBy] = horizontal
        ? [p, fixed - 1, p, fixed]
        : [fixed - 1, p, fixed, p];
      const walkableA = inBounds(sideAx, sideAy, door.floor, width, height, door.floor + 1) &&
        isWalkable(getCell(cells, sideAx, sideAy, door.floor, width, height));
      const walkableB = inBounds(sideBx, sideBy, door.floor, width, height, door.floor + 1) &&
        isWalkable(getCell(cells, sideBx, sideBy, door.floor, width, height));
      if (!walkableA || !walkableB) {
        push(errors, 4, `Door ${door.id}: not walkable on both sides at cell ${p}`, door.floor);
      }
    }

    // A jamb is satisfied by a perpendicular wall (checked on the grid LINE
    // at the door's edge) OR by the door bleeding seamlessly into another
    // walkable feature (checked on the flanking CELL just outside the door
    // span — e.g. a CELL.STAIR footprint placed directly against the room,
    // which by design shares no wall with it, see stage 5/6). What must
    // never happen is a jamb dead-ending into bare CELL.EMPTY with neither a
    // wall nor another walkable connection.
    const perpendicular = horizontal ? 'vertical' : 'horizontal';
    const otherWalls = walls.filter((w) => !(w.doorId === door.id));

    const wallAt = (lineCol) => wallCoversPoint(
      otherWalls, door.floor, horizontal ? lineCol : fixed, horizontal ? fixed : lineCol, perpendicular
    );
    const mergesIntoWalkable = (flankCol) => {
      const [ax, ay, bx, by] = horizontal
        ? [flankCol, fixed - 1, flankCol, fixed]
        : [fixed - 1, flankCol, fixed, flankCol];
      const aWalkable = inBounds(ax, ay, door.floor, width, height, door.floor + 1) &&
        isWalkable(getCell(cells, ax, ay, door.floor, width, height));
      const bWalkable = inBounds(bx, by, door.floor, width, height, door.floor + 1) &&
        isWalkable(getCell(cells, bx, by, door.floor, width, height));
      return aWalkable && bWalkable;
    };

    // Start jamb: the wall line sits at x=start; the flanking cell just
    // outside the door span is one column further back, at x=start-1.
    if (!wallAt(start) && !mergesIntoWalkable(start - 1)) {
      push(errors, 4, `Door ${door.id}: no wall or walkable merge at start jamb (${door.x1},${door.y1})`, door.floor);
    }
    // End jamb: the wall line and the flanking cell coincide at x=end.
    if (!wallAt(end) && !mergesIntoWalkable(end)) {
      push(errors, 4, `Door ${door.id}: no wall or walkable merge at end jamb (${door.x2},${door.y2})`, door.floor);
    }
  }
}

// --- #5 No orphan walls --------------------------------------------------------
function checkRule5(dungeon, errors) {
  const { cells, width, height, walls = [] } = dungeon;
  for (const wall of walls) {
    const horizontal = wall.y1 === wall.y2;
    const start = horizontal ? wall.x1 : wall.y1;
    const end = horizontal ? wall.x2 : wall.y2;
    const fixed = horizontal ? wall.y1 : wall.x1;

    let bordersWalkable = false;
    for (let p = start; p < end && !bordersWalkable; p++) {
      const [ax, ay, bx, by] = horizontal ? [p, fixed - 1, p, fixed] : [fixed - 1, p, fixed, p];
      const wa = inBounds(ax, ay, wall.floor, width, height, wall.floor + 1) &&
        isWalkable(getCell(cells, ax, ay, wall.floor, width, height));
      const wb = inBounds(bx, by, wall.floor, width, height, wall.floor + 1) &&
        isWalkable(getCell(cells, bx, by, wall.floor, width, height));
      if (wa || wb) bordersWalkable = true;
    }
    if (!bordersWalkable) {
      push(errors, 5, `WallSegment on floor ${wall.floor} (${wall.x1},${wall.y1})-(${wall.x2},${wall.y2}) borders no walkable cell`, wall.floor);
    }
  }
}

// --- #6 No content-less dead end (re-validates stage 7 prune's postcondition) --
function checkRule6(dungeon, errors) {
  const { cells, width, height, floors = 1 } = dungeon;
  for (let floor = 0; floor < floors; floor++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (getCell(cells, x, y, floor, width, height) !== CELL.HALLWAY) continue;
        let walkableNeighbors = 0;
        let protectedNeighbor = false;
        for (const { dx, dy } of DIRS4) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
          const v = getCell(cells, nx, ny, floor, width, height);
          if (isWalkable(v)) walkableNeighbors++;
          if (v === CELL.ROOM || v === CELL.STAIR) protectedNeighbor = true;
        }
        if (walkableNeighbors === 1 && !protectedNeighbor) {
          push(errors, 6, `floor ${floor}: content-less dead end at (${x},${y})`, floor);
        }
      }
    }
  }
}

// --- #7 Wall budget -------------------------------------------------------------
function checkRule7(dungeon, errors) {
  const walls = dungeon.walls ?? [];
  if (walls.length >= 1500) {
    push(errors, 7, `walls.length (${walls.length}) >= 1500 global budget`);
  }
}

// --- #8 Every room reachable (has >=1 door) --------------------------------------
function checkRule8(dungeon, errors) {
  for (const room of dungeon.rooms ?? []) {
    if ((room.doors ?? []).length < 1) {
      push(errors, 8, `Room ${room.id}: has no doors`, room.floor);
    }
  }
}

// --- #9 Complete key ---------------------------------------------------------------
function checkRule9(dungeon, errors) {
  const { rooms = [], areas = [], key = {} } = dungeon;
  for (const room of rooms) {
    const matches = areas.filter((a) => a.roomId === room.id).length;
    if (matches !== 1) {
      push(errors, 9, `Room ${room.id}: has ${matches} Areas (expected exactly 1)`, room.floor);
    }
  }
  const entries = key.entries ?? [];
  for (const area of areas) {
    const matches = entries.filter((e) => e.areaId === area.id).length;
    if (matches !== 1) {
      push(errors, 9, `Area ${area.id}: has ${matches} KeyEntries (expected exactly 1)`, area.floor);
    }
  }
}

// --- #10 Unique, contiguous labels --------------------------------------------------
function parseLabelNumber(label, scheme) {
  if (scheme === 'flat') return parseInt(label, 10);
  if (scheme === 'alpha-floor') return parseInt(label.slice(1), 10);
  return parseInt(label.split('-')[1], 10); // per-floor
}

function checkRule10(dungeon, errors) {
  const { areas = [], key = {}, config = {} } = dungeon;
  const labels = areas.map((a) => a.label);
  if (new Set(labels).size !== labels.length) {
    push(errors, 10, `duplicate area labels found among: ${labels.join(', ')}`);
  }

  const startAt = config.key?.startAt ?? 1;
  const byFloor = new Map();
  for (const area of areas) {
    if (typeof area.label !== 'string') continue; // rule 9 already flags a missing/malformed Area
    if (!byFloor.has(area.floor)) byFloor.set(area.floor, []);
    byFloor.get(area.floor).push(parseLabelNumber(area.label, key.scheme));
  }
  for (const [floor, numbers] of byFloor) {
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== startAt + i) {
        push(errors, 10, `floor ${floor}: label numbering has a gap or doesn't start at ${startAt} (got ${sorted.join(',')})`, floor);
        break;
      }
    }
  }
}

// --- #11 Symmetric exits -----------------------------------------------------------
function checkRule11(dungeon, errors) {
  const { areas = [], key = {} } = dungeon;
  const areasByLabel = new Map(areas.map((a) => [a.label, a]));
  for (const area of areas) {
    for (const exit of area.exits ?? []) {
      const target = areasByLabel.get(exit.toLabel);
      if (!target) {
        push(errors, 11, `Area ${area.label}: exit points to unknown label ${exit.toLabel}`, area.floor);
        continue;
      }
      const hasReturn = (target.exits ?? []).some((e) => e.toLabel === area.label);
      if (!hasReturn) {
        push(errors, 11, `Area ${area.label}: exit to ${exit.toLabel} has no matching return exit`, area.floor);
      }
    }
  }
  void key; // key.byLabel not needed once areas already carry labels
}

// --- #12 Valid anchors --------------------------------------------------------------
function nearestWallDistance(walls, floor, cx, cy) {
  let best = Infinity;
  for (const w of walls) {
    if (w.floor !== floor) continue;
    const horizontal = w.y1 === w.y2;
    let d;
    if (horizontal) {
      const clampedX = Math.max(w.x1, Math.min(cx, w.x2));
      d = Math.hypot(cx - clampedX, cy - w.y1);
    } else {
      const clampedY = Math.max(w.y1, Math.min(cy, w.y2));
      d = Math.hypot(cx - w.x1, cy - clampedY);
    }
    if (d < best) best = d;
  }
  return best;
}

function checkRule12(dungeon, errors) {
  const { cells, width, height, areas = [], walls = [] } = dungeon;
  for (const area of areas) {
    const x = Math.round(area.cx);
    const y = Math.round(area.cy);
    if (!inBounds(x, y, area.floor, width, height, area.floor + 1) ||
      !isWalkable(getCell(cells, x, y, area.floor, width, height))) {
      push(errors, 12, `Area ${area.label}: anchor (${area.cx},${area.cy}) is not on a walkable cell`, area.floor);
      continue;
    }
    const dist = nearestWallDistance(walls, area.floor, area.cx, area.cy);
    if (dist < 0.4) {
      push(errors, 12, `Area ${area.label}: anchor is ${dist.toFixed(2)} cells from the nearest wall (< 0.4)`, area.floor);
    }
  }
}

// --- #13 Faithful legend -------------------------------------------------------------
const ROLE_TO_LEGEND_KIND = {
  entrance: 'entrance',
  climax: 'climax',
  treasure: 'treasure',
  junction: 'junction',
};

function checkRule13(dungeon, errors) {
  const { rooms = [], links = [], key = {} } = dungeon;
  const expected = new Set(['area']);
  for (const room of rooms) {
    const kind = ROLE_TO_LEGEND_KIND[room.role];
    if (kind) expected.add(kind);
  }
  if (links.length > 0) {
    expected.add('stairUp');
    expected.add('stairDown');
  }

  const actual = new Set((key.legend ?? []).map((s) => s.kind));
  for (const kind of expected) {
    if (!actual.has(kind)) push(errors, 13, `legend is missing symbol kind '${kind}', which is used in this dungeon`);
  }
  for (const kind of actual) {
    if (!expected.has(kind)) push(errors, 13, `legend declares symbol kind '${kind}', which is not used by anything`);
  }
}

// --- #14 Notes budget -----------------------------------------------------------------
function checkRule14(dungeon, errors) {
  const total = (dungeon.areas ?? []).length + (dungeon.links ?? []).length * 2;
  if (total > 60) {
    push(errors, 14, `areas.length + links.length*2 (${total}) exceeds the 60 Notes global budget`);
  }
}

// --- #15 Integral linkage (converse of #9 — pre-emit, adapter Region-pairing is out of scope) --
function checkRule15(dungeon, errors) {
  const areaIds = new Set((dungeon.areas ?? []).map((a) => a.id));
  for (const entry of (dungeon.key ?? {}).entries ?? []) {
    if (!areaIds.has(entry.areaId)) {
      push(errors, 15, `KeyEntry ${entry.label}: references non-existent Area ${entry.areaId}`);
    }
  }
}

const RULES = [
  checkRule1, checkRule2, checkRule3, checkRule4, checkRule5,
  checkRule6, checkRule7, checkRule8, checkRule9, checkRule10,
  checkRule11, checkRule12, checkRule13, checkRule14, checkRule15,
];

/**
 * @param {import('./types.js').Dungeon} dungeon
 * @returns {{ ok: boolean, errors: import('./types.js').Issue[] }}
 */
export function validateDungeon(dungeon) {
  const errors = [];
  for (const rule of RULES) rule(dungeon, errors);
  return { ok: errors.length === 0, errors };
}
