// harness/src/room-manager.js
//
// DOM wiring for the room manager prototype: room list (grouped by floor),
// a "Regions" panel previewing VerticalLinks (the pre-adapter-foundry stand-in
// for real Foundry Regions), and a detail pane with the selected room's
// rotatable thumbnail, real exits, and an in-memory (unsaved) annotation.
import { buildRoomThumbnailSVG } from './room-thumbnail.js';
import { buildFloorEditorSVG, wireFloorEditorDrag } from './floor-editor.js';

const FLOOR_EDITOR_GRID_SIZE = 24;

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
}

function selectRoom(roomId) {
  selectedRoomId = roomId;
  rotationDeg = 0;
  el('rotation').value = 0;
  renderRoomList();
  renderDetail();
  renderFloorEditor();
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
