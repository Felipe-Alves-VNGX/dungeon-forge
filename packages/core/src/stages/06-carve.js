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

    for (const node of path) {
      if (getCell(grid, node.x, node.y, floor, width, height) === CELL.EMPTY) {
        setCell(grid, node.x, node.y, floor, width, height, CELL.HALLWAY);
      }
    }
  }
}
