// harness/src/room-manager.js
//
// DOM wiring for the room manager prototype: room list (grouped by floor),
// a "Regions" panel previewing VerticalLinks (the pre-adapter-foundry stand-in
// for real Foundry Regions), and a detail pane with the selected room's
// rotatable thumbnail, real exits, and an in-memory (unsaved) annotation.
import { buildRoomThumbnailSVG } from './room-thumbnail.js';
import { buildFloorEditorSVG, wireFloorEditorDrag } from './floor-editor.js';
import {
  SHAPE_TYPES, defaultParamsFor, smallRoomWarningApplies,
  buildShapeEditorSVG, cellsFromRoom, toggleCustomCell, isDisconnected, wireShapeEditorToggle,
} from '@dungeon-forge/room-shape-ui';

const FLOOR_EDITOR_GRID_SIZE = 24;
const SHAPE_EDITOR_GRID_SIZE = 24;

const ROLE_LABEL = {
  entrance: 'Entrada',
  climax: 'Clímax',
  treasure: 'Tesouro',
  junction: 'Junção',
  filler: 'Comum',
};

const DIR_LABEL = { n: 'N', s: 'S', e: 'L', w: 'O', up: '↑', down: '↓' };

let dungeon = null;
let selectedRoomId = null;
let rotationDeg = 0;
const annotations = new Map(); // roomId -> string, in-memory only, resets on reload

function el(id) {
  return document.getElementById(id);
}

export function initRoomManager() {
  el('rotation').addEventListener('input', (event) => {
    rotationDeg = Number(event.target.value);
    renderDetail();
  });
  el('room-annotation').addEventListener('input', (event) => {
    if (selectedRoomId != null) annotations.set(selectedRoomId, event.target.value);
  });
  populateShapeTypeSelect();
  el('shape-type').addEventListener('change', (e) => applyShapeType(e.target.value));
  el('shape-param').addEventListener('change', (e) => applyShapeParam(e.target.value));
  el('shape-w-minus').addEventListener('click', () => applySizeDelta('w', -1));
  el('shape-w-plus').addEventListener('click', () => applySizeDelta('w', 1));
  el('shape-h-minus').addEventListener('click', () => applySizeDelta('h', -1));
  el('shape-h-plus').addEventListener('click', () => applySizeDelta('h', 1));
}

export function setDungeon(nextDungeon) {
  dungeon = nextDungeon;
  selectedRoomId = dungeon.rooms[0]?.id ?? null;
  rotationDeg = 0;
  el('rotation').value = 0;
  renderRoomList();
  renderRegionsList();
  renderDetail();
  renderFloorEditor();
  renderShapeEditor();
}

function selectRoom(roomId) {
  selectedRoomId = roomId;
  rotationDeg = 0;
  el('rotation').value = 0;
  renderRoomList();
  renderDetail();
  renderFloorEditor();
  renderShapeEditor();
}

function renderFloorEditor() {
  const container = el('floor-editor');
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  const floor = room?.floor ?? 0;

  container.innerHTML = buildFloorEditorSVG(dungeon, floor, FLOOR_EDITOR_GRID_SIZE);
  // Dragging only changes room.x/y/cx/cy — the thumbnail (shape-relative
  // only) and exits list (same doors/edges) don't depend on position, so
  // there's nothing else in the UI that needs to react to onMoved yet.
  wireFloorEditorDrag(container, dungeon, FLOOR_EDITOR_GRID_SIZE, () => {});
}

function populateShapeTypeSelect() {
  el('shape-type').innerHTML = SHAPE_TYPES.map((s) => `<option value="${s.type}">${s.label}</option>`).join('');
}

function renderShapeEditor() {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  const editorEl = el('shape-editor');
  if (!room) {
    editorEl.innerHTML = '';
    return;
  }

  const type = room.shape?.type ?? 'rect';
  const def = SHAPE_TYPES.find((s) => s.type === type);
  el('shape-type').value = type;

  const paramRow = el('shape-param-row');
  if (def.param) {
    paramRow.hidden = false;
    el('shape-param-label').textContent = def.param.label;
    el('shape-param').innerHTML = def.param.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
    el('shape-param').value = room.shape?.params?.[def.param.key] ?? def.param.options[0].value;
  } else {
    paramRow.hidden = true;
  }

  el('shape-w-value').textContent = room.w;
  el('shape-h-value').textContent = room.h;

  // In custom mode, w/h are derived from the bounding box of shape.params.cells
  // (kept in sync by applyCustomToggle on every cell toggle) — they are never
  // a direct user input in that mode, so the steppers must be disabled.
  const sizeSteppersDisabled = type === 'custom';
  el('shape-w-minus').disabled = sizeSteppersDisabled;
  el('shape-w-plus').disabled = sizeSteppersDisabled;
  el('shape-h-minus').disabled = sizeSteppersDisabled;
  el('shape-h-plus').disabled = sizeSteppersDisabled;

  const warning = el('shape-warning');
  if (type === 'custom' && isDisconnected(room.shape.params.cells)) {
    warning.hidden = false;
    warning.textContent = 'Células desconectadas — carve.js pode gerar um corredor estranho até aqui.';
  } else if (smallRoomWarningApplies(type, room.w, room.h)) {
    warning.hidden = false;
    warning.textContent = `Formas L/cruz/círculo/triângulo exigem lado >= 4; esta sala (${room.w}x${room.h}) vira retângulo.`;
  } else {
    warning.hidden = true;
  }

  const interactive = type === 'custom';
  editorEl.innerHTML = buildShapeEditorSVG(room, dungeon, SHAPE_EDITOR_GRID_SIZE, interactive);
  if (interactive) {
    wireShapeEditorToggle(editorEl, (x, y) => applyCustomToggle(room, x, y));
  }
}

function applyCustomToggle(room, x, y) {
  room.shape.params.cells = toggleCustomCell(room.shape.params.cells, room, x, y);
  const bounds = room.shape.params.cells.reduce(
    (acc, [dx, dy]) => ({
      minX: Math.min(acc.minX, dx), minY: Math.min(acc.minY, dy),
      maxX: Math.max(acc.maxX, dx), maxY: Math.max(acc.maxY, dy),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  // Re-anchor room.x/y to the new bounding box's origin and re-express every
  // stored cell relative to that new origin, so room.x/y/w/h stay the true
  // bounding box of shape.params.cells (same invariant the other 5 shapes
  // maintain implicitly via their own w/h-driven rasterizers).
  room.x += bounds.minX;
  room.y += bounds.minY;
  room.w = bounds.maxX - bounds.minX + 1;
  room.h = bounds.maxY - bounds.minY + 1;
  room.shape.params.cells = room.shape.params.cells.map(([dx, dy]) => [dx - bounds.minX, dy - bounds.minY]);
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
  afterShapeChange();
}

function applyShapeType(type) {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  if (!room) return;
  if (room.shape?.type === 'custom' && type !== 'custom') {
    if (!window.confirm('Isso descarta os ajustes manuais desta sala. Continuar?')) {
      el('shape-type').value = 'custom'; // revert the dropdown's own optimistic change
      return;
    }
  }
  if (type === 'custom') {
    room.shape = { type: 'custom', params: { cells: cellsFromRoom(room) } };
  } else {
    const effective = smallRoomWarningApplies(type, room.w, room.h) ? 'rect' : type;
    room.shape = { type: effective, params: defaultParamsFor(effective) };
  }
  afterShapeChange();
}

function applyShapeParam(value) {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  if (!room?.shape) return;
  const def = SHAPE_TYPES.find((s) => s.type === room.shape.type);
  if (!def?.param) return;
  room.shape = { type: room.shape.type, params: { [def.param.key]: value } };
  afterShapeChange();
}

function applySizeDelta(dim, delta) {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  if (!room) return;
  // Defense in depth: w/h steppers are disabled in the UI while in custom
  // mode (renderShapeEditor), but guard here too in case this is ever
  // reached some other way (e.g. a non-conformant browser still firing
  // click on a disabled button, or a future direct call).
  if (room.shape?.type === 'custom') return;
  const max = dim === 'w' ? dungeon.width - room.x : dungeon.height - room.y;
  const next = Math.max(1, Math.min(max, room[dim] + delta));
  if (next === room[dim]) return;
  room[dim] = next;
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
  const currentType = room.shape?.type ?? 'rect';
  if (smallRoomWarningApplies(currentType, room.w, room.h)) {
    room.shape = { type: 'rect', params: {} };
  }
  afterShapeChange();
}

function afterShapeChange() {
  renderShapeEditor();
  renderDetail();
  renderFloorEditor();
}

function renderRoomList() {
  const container = el('room-list');
  const byFloor = new Map();
  for (const room of dungeon.rooms) {
    if (!byFloor.has(room.floor)) byFloor.set(room.floor, []);
    byFloor.get(room.floor).push(room);
  }
  const areaByRoomId = new Map(dungeon.areas.map((a) => [a.roomId, a]));

  let html = '';
  for (const [floor, rooms] of [...byFloor.entries()].sort((a, b) => a[0] - b[0])) {
    html += `<h3>Andar ${floor + 1}</h3><ul class="room-items">`;
    for (const room of rooms) {
      const area = areaByRoomId.get(room.id);
      const active = room.id === selectedRoomId ? ' active' : '';
      html += `<li class="room-item${active}" data-room-id="${room.id}">
        <span class="room-label">${area?.label ?? room.id}</span>
        <span class="room-role role-${room.role}">${ROLE_LABEL[room.role] ?? room.role}</span>
      </li>`;
    }
    html += '</ul>';
  }
  container.innerHTML = html;
  for (const li of container.querySelectorAll('.room-item')) {
    li.addEventListener('click', () => selectRoom(Number(li.dataset.roomId)));
  }
}

function renderRegionsList() {
  const container = el('regions-list');
  if (dungeon.links.length === 0) {
    container.innerHTML = '<p class="empty">Nenhuma escada (Region) neste layout.</p>';
    return;
  }
  const areaByRoomId = new Map(dungeon.areas.map((a) => [a.roomId, a]));
  let html = '<ul class="region-items">';
  for (const link of dungeon.links) {
    const fromLabel = areaByRoomId.get(link.roomIdFrom)?.label ?? link.roomIdFrom;
    const toLabel = areaByRoomId.get(link.roomIdTo)?.label ?? link.roomIdTo;
    html += `<li>${fromLabel} ↔ ${toLabel} <span class="region-floors">(andar ${link.fromFloor + 1} → ${link.toFloor + 1})</span></li>`;
  }
  html += '</ul>';
  container.innerHTML = html;
}

function renderDetail() {
  const room = dungeon.rooms.find((r) => r.id === selectedRoomId);
  const thumbEl = el('room-thumbnail');
  const exitsEl = el('room-exits');
  const annotationEl = el('room-annotation');

  if (!room) {
    thumbEl.innerHTML = '';
    exitsEl.innerHTML = '';
    annotationEl.value = '';
    return;
  }

  thumbEl.innerHTML = buildRoomThumbnailSVG(room, dungeon.doors, rotationDeg);

  const area = dungeon.areas.find((a) => a.roomId === room.id);
  const exits = area?.exits ?? [];
  if (exits.length === 0) {
    exitsEl.innerHTML = '<p class="empty">Sem saídas.</p>';
  } else {
    const items = exits.map((e) => {
      const dirLabel = DIR_LABEL[e.dir] ?? e.dir;
      const viaLabel = e.via === 'secret' ? ' (secreta)' : e.via === 'stair' ? ' (escada)' : '';
      return `<li>${dirLabel} → ${e.toLabel}${viaLabel}</li>`;
    }).join('');
    exitsEl.innerHTML = `<ul class="exit-items">${items}</ul>`;
  }

  annotationEl.value = annotations.get(room.id) ?? '';
}
