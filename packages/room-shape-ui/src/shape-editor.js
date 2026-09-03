// harness/src/shape-editor.js
//
// Macro shape editor: picks one of packages/core's 5 room shape types
// (rect/l/cross/circle/triangle) plus its type-specific parameter, and lets
// the user resize the room (w/h). Every control change applies directly to
// room.shape/room.w/room.h/room.cx/room.cy, live — same convention as the
// rest of the harness (drag-to-move, annotations). The preview grid below
// the controls is read-only: it always shows exactly what rasterizeRoom(room)
// would produce for the currently-selected type/param/size, so there's never
// a gap between what's previewed and what gets applied.
import { rasterizeRoom } from '@dungeon-forge/core';

const CELL_PADDING = 3;

export const SHAPE_TYPES = [
  { type: 'rect', label: 'Retângulo', param: null },
  {
    type: 'l', label: 'L',
    param: {
      key: 'corner', label: 'Canto',
      options: [
        { value: 'nw', label: 'Noroeste' },
        { value: 'ne', label: 'Nordeste' },
        { value: 'sw', label: 'Sudoeste' },
        { value: 'se', label: 'Sudeste' },
      ],
    },
  },
  { type: 'cross', label: 'Cruz', param: null },
  { type: 'circle', label: 'Círculo', param: null },
  {
    type: 'triangle', label: 'Triângulo',
    param: {
      key: 'orientation', label: 'Orientação',
      options: [
        { value: 'up', label: 'Cima' },
        { value: 'down', label: 'Baixo' },
        { value: 'left', label: 'Esquerda' },
        { value: 'right', label: 'Direita' },
      ],
    },
  },
  { type: 'custom', label: 'Começar do zero (custom)', param: null },
];

export function defaultParamsFor(type) {
  const def = SHAPE_TYPES.find((s) => s.type === type);
  if (!def?.param) return {};
  return { [def.param.key]: def.param.options[0].value };
}

export function smallRoomWarningApplies(type, w, h) {
  return type !== 'rect' && type !== 'custom' && (w < 4 || h < 4);
}

export function cellsFromRoom(room) {
  return rasterizeRoom(room).map((cell) => [cell.x - room.x, cell.y - room.y]);
}

export function toggleCustomCell(cells, room, x, y) {
  const dx = x - room.x;
  const dy = y - room.y;
  const idx = cells.findIndex(([cdx, cdy]) => cdx === dx && cdy === dy);
  if (idx === -1) return [...cells, [dx, dy]];
  if (cells.length === 1) return cells;
  return cells.filter((_, i) => i !== idx);
}

export function isDisconnected(cells) {
  if (cells.length <= 1) return false;
  const key = (x, y) => `${x},${y}`;
  const set = new Set(cells.map(([x, y]) => key(x, y)));
  const seen = new Set([key(cells[0][0], cells[0][1])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([nx, ny]);
      }
    }
  }
  return seen.size < cells.length;
}

export function buildShapeEditorSVG(room, dungeon, gridSize, interactive = false) {
  const areaX = Math.max(0, room.x - CELL_PADDING);
  const areaY = Math.max(0, room.y - CELL_PADDING);
  const areaMaxX = Math.min(dungeon.width, room.x + room.w + CELL_PADDING);
  const areaMaxY = Math.min(dungeon.height, room.y + room.h + CELL_PADDING);
  const cols = areaMaxX - areaX;
  const rows = areaMaxY - areaY;

  if (!interactive) {
    const cells = rasterizeRoom(room).map((cell) => {
      const gx = cell.x - areaX;
      const gy = cell.y - areaY;
      return `<rect class="shape-cell-on" x="${gx * gridSize}" y="${gy * gridSize}" width="${gridSize}" height="${gridSize}" />`;
    }).join('');
    return `<svg class="shape-editor-svg" viewBox="0 0 ${cols * gridSize} ${rows * gridSize}" xmlns="http://www.w3.org/2000/svg">
      <rect class="shape-editor-bg" x="0" y="0" width="${cols * gridSize}" height="${rows * gridSize}" />
      ${cells}
    </svg>`;
  }

  const onSet = new Set(rasterizeRoom(room).map((cell) => `${cell.x},${cell.y}`));
  let cells = '';
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = areaX + gx;
      const cy = areaY + gy;
      const on = onSet.has(`${cx},${cy}`);
      cells += `<rect class="shape-cell${on ? ' shape-cell-on' : ''}" data-cx="${cx}" data-cy="${cy}"
        x="${gx * gridSize}" y="${gy * gridSize}" width="${gridSize}" height="${gridSize}" />`;
    }
  }
  return `<svg class="shape-editor-svg" viewBox="0 0 ${cols * gridSize} ${rows * gridSize}" xmlns="http://www.w3.org/2000/svg">
    ${cells}
  </svg>`;
}

export function wireShapeEditorToggle(container, onToggle) {
  const svg = container.querySelector('.shape-editor-svg');
  if (!svg) return;
  for (const rect of svg.querySelectorAll('.shape-cell')) {
    rect.addEventListener('click', () => {
      onToggle(Number(rect.dataset.cx), Number(rect.dataset.cy));
    });
  }
}
