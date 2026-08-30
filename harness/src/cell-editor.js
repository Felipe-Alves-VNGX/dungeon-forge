// harness/src/cell-editor.js
//
// Cell-by-cell layout editor prototype: lets the user toggle individual grid
// cells to sketch a room shape. The underlying core model (packages/core)
// only understands rectangular rooms today (SPEC.md's room-shape
// generalization phase hasn't landed yet), so the toggled cell set is never
// applied as-is — only its bounding rectangle is. The grid visually
// distinguishes toggled cells from the applied bounding rect (dashed
// outline) so that gap is honest in the UI, not just in this comment.
const CELL_PADDING = 3;

export function cellKey(x, y) {
  return `${x},${y}`;
}

export function rectToCellSet(room) {
  const set = new Set();
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      set.add(cellKey(room.x + dx, room.y + dy));
    }
  }
  return set;
}

export function cellSetToBoundingRect(cellSet) {
  if (cellSet.size === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const key of cellSet) {
    const [x, y] = key.split(',').map(Number);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function buildCellGridSVG(room, cellSet, dungeon, gridSize) {
  const areaX = Math.max(0, room.x - CELL_PADDING);
  const areaY = Math.max(0, room.y - CELL_PADDING);
  const areaMaxX = Math.min(dungeon.width, room.x + room.w + CELL_PADDING);
  const areaMaxY = Math.min(dungeon.height, room.y + room.h + CELL_PADDING);
  const cols = areaMaxX - areaX;
  const rows = areaMaxY - areaY;

  let cells = '';
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = areaX + gx;
      const cy = areaY + gy;
      const on = cellSet.has(cellKey(cx, cy));
      cells += `<rect class="grid-cell${on ? ' grid-cell-on' : ''}" data-cx="${cx}" data-cy="${cy}"
        x="${gx * gridSize}" y="${gy * gridSize}" width="${gridSize}" height="${gridSize}" />`;
    }
  }

  const applied = cellSetToBoundingRect(cellSet);
  const appliedRect = applied
    ? `<rect class="grid-applied-rect" x="${(applied.x - areaX) * gridSize}" y="${(applied.y - areaY) * gridSize}"
        width="${applied.w * gridSize}" height="${applied.h * gridSize}" />`
    : '';

  return `<svg class="cell-editor-svg" viewBox="0 0 ${cols * gridSize} ${rows * gridSize}" xmlns="http://www.w3.org/2000/svg">
    ${cells}
    ${appliedRect}
  </svg>`;
}

/**
 * Wires click-to-toggle on every `.grid-cell` inside `container`. Mutates
 * `cellSet` in place (refuses to empty it — a room needs at least one cell)
 * and calls `onToggle` after every change so the caller can recompute and
 * apply the bounding rectangle.
 */
export function wireCellGridToggle(container, cellSet, onToggle) {
  const svg = container.querySelector('.cell-editor-svg');
  if (!svg) return;

  for (const rect of svg.querySelectorAll('.grid-cell')) {
    rect.addEventListener('click', () => {
      const key = cellKey(Number(rect.dataset.cx), Number(rect.dataset.cy));
      if (cellSet.has(key)) {
        if (cellSet.size === 1) return;
        cellSet.delete(key);
      } else {
        cellSet.add(key);
      }
      onToggle();
    });
  }
}
