import { CELL, getCell, setCell, inBounds } from '../grid.js';

function roomBoundaryCell(room) {
  // A single accessible cell just outside the room's edge, used as the
  // A* target/source so the path connects to the room without cutting
  // through its interior needlessly.
  return { x: Math.round(room.cx), y: Math.round(room.cy) };
}

export function cellCost(cellValue, costs) {
  switch (cellValue) {
    case CELL.EMPTY:
      return costs.newHallway;
    case CELL.HALLWAY:
      return costs.reuseHallway;
    case CELL.STAIR:
      // A vertical-link footprint is walkable, same as an existing hallway
      // (SPEC.md §5.8, "Arestas verticais: o A* vai até a célula de acesso
      // do footprint do link, não atravessa" — reaching it must be cheap,
      // exactly like reusing a corridor).
      return costs.reuseHallway;
    case CELL.ROOM:
      return costs.throughRoom;
    default:
      return Infinity;
  }
}

function astar(grid, width, height, floor, start, goal, costs) {
  const key = (x, y) => `${x},${y}`;
  const open = new Map([[key(start.x, start.y), { x: start.x, y: start.y, dir: null }]]);
  const cameFrom = new Map();
  const gScore = new Map([[key(start.x, start.y), 0]]);
  const fScore = new Map([[key(start.x, start.y), Math.hypot(goal.x - start.x, goal.y - start.y)]]);

  const dirs = [
    { dx: 1, dy: 0, name: 'e' },
    { dx: -1, dy: 0, name: 'w' },
    { dx: 0, dy: 1, name: 's' },
    { dx: 0, dy: -1, name: 'n' },
  ];

  while (open.size > 0) {
    let currentKey = null;
    let currentF = Infinity;
    for (const [k, node] of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentKey = k;
      }
    }
    const current = open.get(currentKey);
    open.delete(currentKey);

    if (current.x === goal.x && current.y === goal.y) {
      const path = [current];
      let k = currentKey;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k);
        path.unshift(prev);
        k = key(prev.x, prev.y);
      }
      return path;
    }

    for (const d of dirs) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;
      if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;

      const cellValue = getCell(grid, nx, ny, floor, width, height);
      const stepCost = cellCost(cellValue, costs);
      if (!Number.isFinite(stepCost)) continue;

      const turnPenalty = current.dir && current.dir !== d.name ? costs.turn : 0;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost + turnPenalty;

      const nKey = key(nx, ny);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + Math.hypot(goal.x - nx, goal.y - ny));
        open.set(nKey, { x: nx, y: ny, dir: d.name });
      }
    }
  }

  return null; // unreachable — caller decides how to handle (should not happen post-M2 given MST connectivity)
}

function stampPath(grid, width, height, floor, path) {
  for (const node of path) {
    if (getCell(grid, node.x, node.y, floor, width, height) === CELL.EMPTY) {
      setCell(grid, node.x, node.y, floor, width, height, CELL.HALLWAY);
    }
  }
}

/**
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {import('../types.js').Room[]} rooms
 * @param {import('../types.js').Edge[]} edges
 * @param {import('../types.js').CarveCosts} costs
 */
export function carve(grid, width, height, floor, rooms, edges, costs) {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));

  const mst = edges.filter((e) => e.kind === 'mst');
  const cycles = edges.filter((e) => e.kind === 'cycle');

  for (const edge of [...mst, ...cycles]) {
    const roomA = roomsById.get(edge.a);
    const roomB = roomsById.get(edge.b);
    const start = roomBoundaryCell(roomA);
    const goal = roomBoundaryCell(roomB);

    const path = astar(grid, width, height, floor, start, goal, costs);
    if (!path) continue;

    stampPath(grid, width, height, floor, path);
  }
}

/**
 * Carves a path from a room to an arbitrary point on the same floor — used
 * to connect the nearest room to a chosen VerticalLink footprint (SPEC.md
 * §5.8, "Arestas verticais").
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {import('../types.js').Room} room
 * @param {{x:number,y:number}} point
 * @param {import('../types.js').CarveCosts} costs
 */
export function carveToPoint(grid, width, height, floor, room, point, costs) {
  const start = roomBoundaryCell(room);
  const goal = { x: Math.round(point.x), y: Math.round(point.y) };
  const path = astar(grid, width, height, floor, start, goal, costs);
  if (!path) return;
  stampPath(grid, width, height, floor, path);
}

function rectTouchesHallway(grid, width, height, floor, cell) {
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      if (!inBounds(x, y, floor, width, height, floor + 1)) continue;
      if (getCell(grid, x, y, floor, width, height) === CELL.HALLWAY) return true;
    }
  }
  return false;
}

/**
 * Converts residual (unpromoted) room-placement cells into HALLWAY wherever
 * they touch a carved corridor, producing the irregular corridor widening
 * described in SPEC.md §5.8 ("Engrossamento de corredor"). residualCells are
 * not guaranteed to be in-bounds (see 01-place-rooms.js's doc comment); each
 * cell is bounds-checked individually rather than clamped up front.
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {{x:number,y:number,w:number,h:number}[]} residualCells
 */
export function thickenCorridors(grid, width, height, floor, residualCells) {
  for (const cell of residualCells) {
    if (!rectTouchesHallway(grid, width, height, floor, cell)) continue;
    for (let y = cell.y; y < cell.y + cell.h; y++) {
      for (let x = cell.x; x < cell.x + cell.w; x++) {
        if (!inBounds(x, y, floor, width, height, floor + 1)) continue;
        if (getCell(grid, x, y, floor, width, height) === CELL.EMPTY) {
          setCell(grid, x, y, floor, width, height, CELL.HALLWAY);
        }
      }
    }
  }
}
