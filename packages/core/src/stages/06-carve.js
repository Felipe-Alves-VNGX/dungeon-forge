import { CELL, getCell, setCell, inBounds } from '../grid.js';

function roomBoundaryCell(room) {
  // A single accessible cell just outside the room's edge, used as the
  // A* target/source so the path connects to the room without cutting
  // through its interior needlessly.
  return { x: Math.round(room.cx), y: Math.round(room.cy) };
}

function cellCost(cellValue, costs) {
  switch (cellValue) {
    case CELL.EMPTY:
      return costs.newHallway;
    case CELL.HALLWAY:
      return costs.reuseHallway;
    case CELL.ROOM:
      return costs.throughRoom;
    // A stair footprint (stage 5) is a valid A* goal/waypoint — as cheap as
    // an existing hallway. Without this case the default Infinity below
    // makes every VerticalLink unreachable, since the goal cell itself
    // would never be admitted into the open set.
    case CELL.STAIR:
      return costs.reuseHallway;
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

function carvePath(grid, width, height, floor, path) {
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
 * @param {import('../types.js').VerticalLink[]} [links]
 */
export function carve(grid, width, height, floor, rooms, edges, costs, links = []) {
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
    carvePath(grid, width, height, floor, path);
  }

  for (const link of links) {
    if (link.fromFloor !== floor && link.toFloor !== floor) continue;
    const roomId = link.fromFloor === floor ? link.roomIdFrom : link.roomIdTo;
    const room = roomsById.get(roomId);
    if (!room) continue;

    const start = roomBoundaryCell(room);
    const goal = { x: link.x, y: link.y };

    const path = astar(grid, width, height, floor, start, goal, costs);
    if (!path) continue;
    carvePath(grid, width, height, floor, path);
  }
}

/**
 * Widens residual (unpromoted) room footprints from stage 1 into the
 * corridor network wherever they touch a carved HALLWAY cell — SPEC.md
 * §5.8's "engrossamento" — producing irregular, wider corridor stretches
 * instead of uniformly 1-cell-wide paths. A residual cell that never
 * touches a corridor stays untouched.
 * @param {Uint8Array} grid
 * @param {number} width @param {number} height @param {number} floor
 * @param {{x:number,y:number,w:number,h:number}[]} residualCells
 */
export function thickenCorridors(grid, width, height, floor, residualCells) {
  for (const cell of residualCells) {
    const x0 = Math.max(0, cell.x);
    const y0 = Math.max(0, cell.y);
    const x1 = Math.min(width, cell.x + cell.w);
    const y1 = Math.min(height, cell.y + cell.h);
    if (x0 >= x1 || y0 >= y1) continue;

    let touchesCorridor = false;
    for (let y = y0; y < y1 && !touchesCorridor; y++) {
      for (let x = x0; x < x1; x++) {
        if (getCell(grid, x, y, floor, width, height) === CELL.HALLWAY) {
          touchesCorridor = true;
          break;
        }
      }
    }
    if (!touchesCorridor) continue;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (getCell(grid, x, y, floor, width, height) === CELL.EMPTY) {
          setCell(grid, x, y, floor, width, height, CELL.HALLWAY);
        }
      }
    }
  }
}
