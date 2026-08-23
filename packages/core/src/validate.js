// packages/core/src/validate.js
import { CELL, isWalkable } from './grid.js';

function isWalkableCell(v) {
  return isWalkable(v);
}

function safeCellAt(cells, width, height, floor, x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return CELL.EMPTY;
  return cells[floor * (width * height) + y * width + x];
}

function pushIssue(errors, code, message) {
  errors.push({ code, message });
}

// --- 1. Conectividade por andar ---
function checkFloorConnectivity(dungeon, errors) {
  const { cells, width, height, floors } = dungeon;
  const size = width * height;
  for (let floor = 0; floor < floors; floor++) {
    const base = floor * size;
    let start = -1;
    for (let i = 0; i < size; i++) {
      if (isWalkableCell(cells[base + i])) { start = i; break; }
    }
    if (start === -1) continue; // no walkable cells on this floor — nothing to check

    const seen = new Uint8Array(size);
    seen[start] = 1;
    const stack = [start];
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width;
      const y = Math.floor(idx / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!seen[nIdx] && isWalkableCell(cells[base + nIdx])) {
          seen[nIdx] = 1;
          stack.push(nIdx);
        }
      }
    }

    let totalWalkable = 0;
    let reached = 0;
    for (let i = 0; i < size; i++) {
      if (isWalkableCell(cells[base + i])) {
        totalWalkable++;
        if (seen[i]) reached++;
      }
    }
    if (reached !== totalWalkable) {
      pushIssue(errors, 'floor-connectivity',
        `floor ${floor}: ${totalWalkable - reached} walkable cell(s) unreachable from the rest of the floor`);
    }
  }
}

// --- 2. Conectividade global (atravessando VerticalLinks) ---
function buildVerticalTransitions(links) {
  const transitions = new Map();
  const add = (x, y, floor, targetFloor) => {
    const key = `${x},${y},${floor}`;
    if (!transitions.has(key)) transitions.set(key, new Set());
    transitions.get(key).add(targetFloor);
  };
  for (const link of links) {
    for (let dy = 0; dy < link.h; dy++) {
      for (let dx = 0; dx < link.w; dx++) {
        const x = link.x + dx;
        const y = link.y + dy;
        add(x, y, link.fromFloor, link.toFloor);
        add(x, y, link.toFloor, link.fromFloor);
      }
    }
  }
  return transitions;
}

function checkGlobalConnectivity(dungeon, errors) {
  const { cells, width, height, floors, links } = dungeon;
  const size = width * height;
  const idx3 = (x, y, z) => z * size + y * width + x;
  const transitions = buildVerticalTransitions(links);

  const startIdx = cells.findIndex(isWalkableCell);
  if (startIdx === -1) {
    pushIssue(errors, 'global-connectivity', 'no walkable cell exists anywhere in the dungeon');
    return;
  }

  const seen = new Uint8Array(cells.length);
  seen[startIdx] = 1;
  const stack = [startIdx];
  while (stack.length) {
    const idx = stack.pop();
    const z = Math.floor(idx / size);
    const rem = idx % size;
    const y = Math.floor(rem / width);
    const x = rem % width;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = idx3(nx, ny, z);
      if (!seen[nIdx] && isWalkableCell(cells[nIdx])) {
        seen[nIdx] = 1;
        stack.push(nIdx);
      }
    }

    const targets = transitions.get(`${x},${y},${z}`);
    if (targets) {
      for (const targetFloor of targets) {
        const nIdx = idx3(x, y, targetFloor);
        if (!seen[nIdx] && isWalkableCell(cells[nIdx])) {
          seen[nIdx] = 1;
          stack.push(nIdx);
        }
      }
    }
  }

  const totalWalkable = Array.from(cells).filter(isWalkableCell).length;
  const reached = Array.from(seen).filter((v) => v === 1).length;
  if (reached !== totalWalkable) {
    pushIssue(errors, 'global-connectivity',
      `${totalWalkable - reached} walkable cell(s) unreachable across floors via VerticalLinks`);
  }
}

// --- 3. Escadas pareadas ---
function checkStairsPaired(dungeon, errors) {
  const { cells, width, height, links } = dungeon;
  const size = width * height;
  for (const link of links) {
    for (const floor of [link.fromFloor, link.toFloor]) {
      for (let dy = 0; dy < link.h; dy++) {
        for (let dx = 0; dx < link.w; dx++) {
          const x = link.x + dx;
          const y = link.y + dy;
          const idx = floor * size + y * width + x;
          if (cells[idx] !== CELL.STAIR) {
            pushIssue(errors, 'stairs-paired',
              `VerticalLink ${link.id}: footprint cell (${x},${y}) on floor ${floor} is not CELL.STAIR`);
          }
        }
      }
    }
  }
}

// --- 4. Portas bem formadas ---
function checkDoorsWellFormed(dungeon, errors) {
  const { cells, width, height, doors } = dungeon;
  for (const door of doors) {
    const horizontal = door.y1 === door.y2;
    if (horizontal) {
      for (let x = door.x1; x < door.x2; x++) {
        const above = safeCellAt(cells, width, height, door.floor, x, door.y1 - 1);
        const below = safeCellAt(cells, width, height, door.floor, x, door.y1);
        if (!isWalkableCell(above) || !isWalkableCell(below)) {
          pushIssue(errors, 'door-well-formed',
            `Door ${door.id}: cell (${x},${door.y1}) on floor ${door.floor} lacks walkable cells on both sides`);
        }
      }
    } else {
      for (let y = door.y1; y < door.y2; y++) {
        const left = safeCellAt(cells, width, height, door.floor, door.x1 - 1, y);
        const right = safeCellAt(cells, width, height, door.floor, door.x1, y);
        if (!isWalkableCell(left) || !isWalkableCell(right)) {
          pushIssue(errors, 'door-well-formed',
            `Door ${door.id}: cell (${door.x1},${y}) on floor ${door.floor} lacks walkable cells on both sides`);
        }
      }
    }
  }
}

// --- 5. Sem parede órfã ---
function checkNoOrphanWalls(dungeon, errors) {
  const { cells, width, height, walls } = dungeon;
  for (const wall of walls) {
    const horizontal = wall.y1 === wall.y2;
    let touchesWalkable = false;
    if (horizontal) {
      for (let x = wall.x1; x < wall.x2 && !touchesWalkable; x++) {
        const above = safeCellAt(cells, width, height, wall.floor, x, wall.y1 - 1);
        const below = safeCellAt(cells, width, height, wall.floor, x, wall.y1);
        if (isWalkableCell(above) || isWalkableCell(below)) touchesWalkable = true;
      }
    } else {
      for (let y = wall.y1; y < wall.y2 && !touchesWalkable; y++) {
        const left = safeCellAt(cells, width, height, wall.floor, wall.x1 - 1, y);
        const right = safeCellAt(cells, width, height, wall.floor, wall.x1, y);
        if (isWalkableCell(left) || isWalkableCell(right)) touchesWalkable = true;
      }
    }
    if (!touchesWalkable) {
      pushIssue(errors, 'no-orphan-walls',
        `WallSegment on floor ${wall.floor} at (${wall.x1},${wall.y1})-(${wall.x2},${wall.y2}) borders no walkable cell`);
    }
  }
}

// --- 6. Sem beco sem conteúdo ---
function checkNoContentlessDeadEnds(dungeon, errors) {
  const { rooms, edges } = dungeon;
  const degree = new Map(rooms.map((r) => [r.id, 0]));
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  for (const room of rooms) {
    if (degree.get(room.id) === 1 && room.role === 'filler') {
      pushIssue(errors, 'contentless-dead-end',
        `Room ${room.id}: leaf room with role 'filler' has no narrative content`);
    }
  }
}

// --- 7. Orçamento de paredes (per-floor — see file header note) ---
function checkWallBudget(dungeon, errors) {
  const { walls, floors } = dungeon;
  const perFloor = new Map();
  for (const w of walls) perFloor.set(w.floor, (perFloor.get(w.floor) ?? 0) + 1);
  for (let floor = 0; floor < floors; floor++) {
    const count = perFloor.get(floor) ?? 0;
    if (count >= 1500) {
      pushIssue(errors, 'wall-budget', `floor ${floor}: ${count} wall segments exceeds the 1500 budget (SPEC.md §6.7)`);
    }
  }
  if (walls.length >= 1500) {
    pushIssue(errors, 'wall-budget', `total: ${walls.length} wall segments exceeds the 1500 budget for a single-Scene (v14) target (SPEC.md §6.7)`);
  }
}

// --- 8. Salas alcançáveis ---
function checkRoomsHaveDoors(dungeon, errors) {
  for (const room of dungeon.rooms) {
    if (room.doors.length === 0) {
      pushIssue(errors, 'room-has-door', `Room ${room.id} has zero doors`);
    }
  }
}

// --- 9. Chave completa ---
function checkKeyComplete(dungeon, errors) {
  const { rooms, areas, key } = dungeon;
  const areaByRoomId = new Map(areas.map((a) => [a.roomId, a]));
  for (const room of rooms) {
    if (!areaByRoomId.has(room.id)) {
      pushIssue(errors, 'key-complete', `Room ${room.id} has no Area`);
    }
  }
  const entryAreaIds = new Set(key.entries.map((e) => e.areaId));
  for (const area of areas) {
    if (!entryAreaIds.has(area.id)) {
      pushIssue(errors, 'key-complete', `Area ${area.id} (${area.label}) has no KeyEntry`);
    }
  }
}

// --- 10. Rótulos únicos e contíguos ---
function checkLabelsUniqueAndContiguous(dungeon, errors) {
  const { areas } = dungeon;
  const labels = areas.map((a) => a.label);
  if (new Set(labels).size !== labels.length) {
    pushIssue(errors, 'labels-unique', 'duplicate Area labels found');
  }

  const byFloor = new Map();
  for (const area of areas) {
    if (!byFloor.has(area.floor)) byFloor.set(area.floor, []);
    byFloor.get(area.floor).push(area.label);
  }
  for (const [floor, floorLabels] of byFloor) {
    const numbers = floorLabels
      .map((label) => label.match(/(\d+)$/))
      .filter(Boolean)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    if (numbers.length !== floorLabels.length) continue; // scheme without trailing digits — not expected for flat/per-floor/alpha-floor
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] !== numbers[i - 1] + 1) {
        pushIssue(errors, 'labels-contiguous',
          `floor ${floor}: area numbering has a gap between ${numbers[i - 1]} and ${numbers[i]}`);
      }
    }
  }
}

// --- 11. Saídas simétricas ---
function checkExitsSymmetric(dungeon, errors) {
  const { areas } = dungeon;
  const areaByLabel = new Map(areas.map((a) => [a.label, a]));
  for (const area of areas) {
    for (const exit of area.exits) {
      if (exit.via !== 'door') continue; // stairs/secret aren't modeled symmetrically by this stage yet
      const target = areaByLabel.get(exit.toLabel);
      if (!target) {
        pushIssue(errors, 'exits-symmetric', `Area ${area.label}: exit points to unknown label '${exit.toLabel}'`);
        continue;
      }
      const hasReciprocal = target.exits.some((e) => e.toLabel === area.label);
      if (!hasReciprocal) {
        pushIssue(errors, 'exits-symmetric', `Area ${area.label} → ${exit.toLabel} has no reciprocal exit`);
      }
    }
  }
}

// --- 12. Âncoras válidas ---
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function checkAnchorsValid(dungeon, errors) {
  const { areas, walls, cells, width, height } = dungeon;
  const MIN_WALL_DISTANCE = 0.4; // in cell units — see file header note on gridSize scaling

  const wallsByFloor = new Map();
  for (const w of walls) {
    if (!wallsByFloor.has(w.floor)) wallsByFloor.set(w.floor, []);
    wallsByFloor.get(w.floor).push(w);
  }

  for (const area of areas) {
    const cellValue = safeCellAt(cells, width, height, area.floor, Math.floor(area.cx), Math.floor(area.cy));
    if (!isWalkableCell(cellValue)) {
      pushIssue(errors, 'anchor-valid', `Area ${area.label}: anchor (${area.cx},${area.cy}) is not inside a walkable cell`);
      continue;
    }
    const floorWalls = wallsByFloor.get(area.floor) ?? [];
    let minDist = Infinity;
    for (const w of floorWalls) {
      minDist = Math.min(minDist, pointToSegmentDistance(area.cx, area.cy, w.x1, w.y1, w.x2, w.y2));
    }
    if (minDist < MIN_WALL_DISTANCE) {
      pushIssue(errors, 'anchor-valid',
        `Area ${area.label}: anchor is ${minDist.toFixed(2)} cells from a wall, below the ${MIN_WALL_DISTANCE} minimum`);
    }
  }
}

// --- 13. Legenda fiel ---
const LEGEND_KIND_BY_ROLE = { entrance: 'entrance', climax: 'climax', treasure: 'treasure', junction: 'junction' };

function checkLegendFaithful(dungeon, errors) {
  const { key, rooms } = dungeon;
  const legendKinds = new Set(key.legend.map((s) => s.kind));
  for (const room of rooms) {
    const expectedKind = LEGEND_KIND_BY_ROLE[room.role] ?? 'area';
    if (!legendKinds.has(expectedKind)) {
      pushIssue(errors, 'legend-faithful', `Room ${room.id} has role '${room.role}' but the legend has no '${expectedKind}' entry`);
    }
  }
  const rolesPresent = new Set(rooms.map((r) => LEGEND_KIND_BY_ROLE[r.role] ?? 'area'));
  for (const symbol of key.legend) {
    if (!rolesPresent.has(symbol.kind)) {
      pushIssue(errors, 'legend-faithful', `Legend declares '${symbol.kind}' but no Area uses it`);
    }
  }
}

// --- 14. Orçamento de Notes (per-floor — see file header note) ---
function checkNoteBudget(dungeon, errors) {
  const { areas, links, floors } = dungeon;
  for (let floor = 0; floor < floors; floor++) {
    const areaCount = areas.filter((a) => a.floor === floor).length;
    const linkCount = links.filter((l) => l.fromFloor === floor || l.toFloor === floor).length;
    const total = areaCount + linkCount * 2;
    if (total > 60) {
      pushIssue(errors, 'note-budget', `floor ${floor}: ${total} notes (areas + links*2) exceeds the 60 budget (SPEC.md §6.14)`);
    }
  }
  const totalNotes = areas.length + links.length * 2;
  if (totalNotes > 60) {
    pushIssue(errors, 'note-budget', `total: ${totalNotes} notes (areas + links*2) exceeds the 60 budget for a single-Scene (v14) target (SPEC.md §6.14)`);
  }
}

/**
 * Runs SPEC.md §6's invariants against a Dungeon. Invariant 15 ("vínculo
 * íntegro") is not checked here — it concerns Note↔JournalEntry linkage,
 * which only exists once adapter-foundry emits Foundry documents.
 * @param {import('./types.js').Dungeon} dungeon
 * @returns {{ok: boolean, errors: {code: string, message: string}[]}}
 */
export function validateDungeon(dungeon) {
  const errors = [];
  checkFloorConnectivity(dungeon, errors);
  checkGlobalConnectivity(dungeon, errors);
  checkStairsPaired(dungeon, errors);
  checkDoorsWellFormed(dungeon, errors);
  checkNoOrphanWalls(dungeon, errors);
  checkNoContentlessDeadEnds(dungeon, errors);
  checkWallBudget(dungeon, errors);
  checkRoomsHaveDoors(dungeon, errors);
  checkKeyComplete(dungeon, errors);
  checkLabelsUniqueAndContiguous(dungeon, errors);
  checkExitsSymmetric(dungeon, errors);
  checkAnchorsValid(dungeon, errors);
  checkLegendFaithful(dungeon, errors);
  checkNoteBudget(dungeon, errors);
  return { ok: errors.length === 0, errors };
}
