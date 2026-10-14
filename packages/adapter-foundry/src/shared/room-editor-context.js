// Pure data-shaping for DungeonForgeRoomEditorApp's _prepareContext — no
// Foundry globals used here, same convention as ./geometry.js, ./icons.js,
// ./key-journal.js, ./config-form.js.
import { SHAPE_TYPES, smallRoomWarningApplies, isDisconnected } from '@dungeon-forge/room-shape-ui';

export function groupRoomsByFloor(rooms, areas, selectedRoomId) {
  const areaByRoomId = new Map(areas.map((a) => [a.roomId, a]));
  const byFloor = new Map();
  for (const room of rooms) {
    if (!byFloor.has(room.floor)) byFloor.set(room.floor, []);
    byFloor.get(room.floor).push(room);
  }
  return [...byFloor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floor, floorRooms]) => ({
      floor: floor + 1,
      rooms: floorRooms.map((room) => ({
        id: room.id,
        label: areaByRoomId.get(room.id)?.label ?? String(room.id),
        active: room.id === selectedRoomId,
      })),
    }));
}

export function buildWarningText(room, type) {
  if (type === 'custom' && isDisconnected(room.shape.params.cells)) {
    return 'Células desconectadas — pode gerar um corredor estranho até aqui.';
  }
  if (smallRoomWarningApplies(type, room.w, room.h)) {
    return `Formas L/cruz/círculo/triângulo exigem lado >= 4; esta sala (${room.w}x${room.h}) vira retângulo.`;
  }
  return null;
}

export function buildDetailContext(room) {
  if (!room) return null;
  const type = room.shape?.type ?? 'rect';
  const def = SHAPE_TYPES.find((s) => s.type === type);
  const selectedParam = room.shape?.params?.[def?.param?.key] ?? '';
  return {
    roomId: room.id,
    shapeTypes: SHAPE_TYPES.map((s) => ({ ...s, selected: s.type === type })),
    selectedType: type,
    hasParam: !!def?.param,
    paramLabel: def?.param?.label ?? '',
    paramOptions: (def?.param?.options ?? []).map((o) => ({ ...o, selected: o.value === selectedParam })),
    w: room.w,
    h: room.h,
    sizeSteppersDisabled: type === 'custom',
    warning: buildWarningText(room, type),
  };
}
