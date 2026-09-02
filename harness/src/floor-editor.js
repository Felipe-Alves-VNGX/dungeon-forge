// harness/src/floor-editor.js
//
// Interactive full-floor SVG for dragging rooms to a new position.
// Reuses buildRenderPlan (packages/render) for wall geometry so this stays
// in sync with what renderFloor() actually draws — no wall math duplicated.
//
// Prototype scope: dragging only moves the room's own rectangle (x/y/cx/cy).
// It does NOT re-carve corridors, re-extract walls, or move doors — those
// stay exactly as generated, so a moved room can end up visually detached
// from its corridors. That's expected here; reflowing the dungeon around a
// manual edit is future work, not part of this increment.
import { buildRenderPlan } from '@dungeon-forge/render';
import { rasterizeRoom } from '@dungeon-forge/core';

export function buildFloorEditorSVG(dungeon, floor, gridSize) {
  const plan = buildRenderPlan(dungeon, floor, gridSize);
  const rooms = dungeon.rooms.filter((r) => r.floor === floor);
  const areaByRoomId = new Map(dungeon.areas.map((a) => [a.roomId, a]));

  const wallLines = plan.wallLines.map((w) => {
    const cls = w.isDoor ? 'edit-wall edit-door' : 'edit-wall';
    return `<line class="${cls}" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" />`;
  }).join('');

  const roomRects = rooms.map((room) => {
    const label = areaByRoomId.get(room.id)?.label ?? room.id;
    const cells = rasterizeRoom(room).map((cell) => {
      const x = cell.x * gridSize;
      const y = cell.y * gridSize;
      return `<rect class="edit-room-cell" x="${x}" y="${y}" width="${gridSize}" height="${gridSize}" data-role="${room.role}" />`;
    }).join('');
    const labelX = (room.x + room.w / 2) * gridSize;
    const labelY = (room.y + room.h / 2) * gridSize;
    return `<g class="editable-room" data-room-id="${room.id}" tabindex="0">
    ${cells}
    <text class="edit-room-label" x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="central">${label}</text>
  </g>`;
  }).join('');

  return `<svg class="floor-editor-svg" viewBox="0 0 ${plan.width} ${plan.height}" xmlns="http://www.w3.org/2000/svg">
    <rect class="edit-bg" x="0" y="0" width="${plan.width}" height="${plan.height}" />
    ${wallLines}
    ${roomRects}
  </svg>`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * Wires pointer-drag on every `.editable-room` group inside `container`.
 * Mutates room.x/y/cx/cy directly (in-memory, no persistence) and updates
 * the dragged rect/label in place. Calls `onMoved(room)` after each move.
 */
export function wireFloorEditorDrag(container, dungeon, gridSize, onMoved) {
  const svg = container.querySelector('.floor-editor-svg');
  if (!svg) return;

  let drag = null;

  function toSvgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm.inverse());
  }

  for (const g of svg.querySelectorAll('.editable-room')) {
    g.addEventListener('pointerdown', (evt) => {
      const room = dungeon.rooms.find((r) => r.id === Number(g.dataset.roomId));
      if (!room) return;
      drag = { room, g, startPointer: toSvgPoint(evt), startX: room.x, startY: room.y };
      g.setPointerCapture(evt.pointerId);
      g.classList.add('dragging');
    });

    g.addEventListener('pointermove', (evt) => {
      if (!drag || drag.g !== g) return;
      const cur = toSvgPoint(evt);
      const dxCells = Math.round((cur.x - drag.startPointer.x) / gridSize);
      const dyCells = Math.round((cur.y - drag.startPointer.y) / gridSize);
      const { room } = drag;
      const newX = clamp(drag.startX + dxCells, 0, dungeon.width - room.w);
      const newY = clamp(drag.startY + dyCells, 0, dungeon.height - room.h);
      if (newX === room.x && newY === room.y) return;

      room.x = newX;
      room.y = newY;
      room.cx = room.x + room.w / 2;
      room.cy = room.y + room.h / 2;

      const cells = rasterizeRoom(room);
      const rects = g.querySelectorAll('.edit-room-cell');
      rects.forEach((rect, idx) => {
        if (idx < cells.length) {
          const cell = cells[idx];
          rect.setAttribute('x', cell.x * gridSize);
          rect.setAttribute('y', cell.y * gridSize);
        }
      });
      const text = g.querySelector('.edit-room-label');
      text.setAttribute('x', (room.x + room.w / 2) * gridSize);
      text.setAttribute('y', (room.y + room.h / 2) * gridSize);

      onMoved?.(room);
    });

    const endDrag = (evt) => {
      if (drag && drag.g === g) {
        g.releasePointerCapture(evt.pointerId);
        g.classList.remove('dragging');
        drag = null;
      }
    };
    g.addEventListener('pointerup', endDrag);
    g.addEventListener('pointercancel', endDrag);
  }
}
