import { describe, it, expect } from 'vitest';
import { groupRoomsByFloor, buildWarningText, buildDetailContext } from '../../src/shared/room-editor-context.js';

describe('groupRoomsByFloor', () => {
  it('groups rooms by floor (1-indexed for display), sorted, marking the selected room active', () => {
    const rooms = [
      { id: 0, floor: 1 }, { id: 1, floor: 0 }, { id: 2, floor: 0 },
    ];
    const areas = [
      { roomId: 0, label: '2-01' }, { roomId: 1, label: '1-01' }, { roomId: 2, label: '1-02' },
    ];
    const result = groupRoomsByFloor(rooms, areas, 2);
    expect(result).toEqual([
      { floor: 1, rooms: [
        { id: 1, label: '1-01', active: false },
        { id: 2, label: '1-02', active: true },
      ] },
      { floor: 2, rooms: [
        { id: 0, label: '2-01', active: false },
      ] },
    ]);
  });

  it('falls back to the room id as the label when no matching area exists', () => {
    const rooms = [{ id: 5, floor: 0 }];
    const result = groupRoomsByFloor(rooms, [], null);
    expect(result[0].rooms[0].label).toBe('5');
  });
});

describe('buildWarningText', () => {
  it('warns about disconnected cells in custom mode', () => {
    const room = { w: 4, h: 4, shape: { type: 'custom', params: { cells: [[0, 0], [5, 5]] } } };
    expect(buildWarningText(room, 'custom')).toMatch(/desconectadas/);
  });

  it('warns about too-small non-rect shapes', () => {
    const room = { w: 3, h: 3, shape: { type: 'l', params: {} } };
    expect(buildWarningText(room, 'l')).toMatch(/vira retângulo/);
  });

  it('returns null when there is nothing to warn about', () => {
    const room = { w: 6, h: 6, shape: { type: 'rect', params: {} } };
    expect(buildWarningText(room, 'rect')).toBeNull();
  });
});

describe('buildDetailContext', () => {
  it('returns null for no selected room', () => {
    expect(buildDetailContext(null)).toBeNull();
  });

  it('builds the full detail context for a rect room, with shapeTypes carrying a selected flag', () => {
    const room = { id: 1, w: 6, h: 6, shape: { type: 'rect', params: {} } };
    const context = buildDetailContext(room);
    expect(context.roomId).toBe(1);
    expect(context.selectedType).toBe('rect');
    expect(context.hasParam).toBe(false);
    expect(context.sizeSteppersDisabled).toBe(false);
    expect(context.warning).toBeNull();
    const rectEntry = context.shapeTypes.find((s) => s.type === 'rect');
    expect(rectEntry.selected).toBe(true);
    const lEntry = context.shapeTypes.find((s) => s.type === 'l');
    expect(lEntry.selected).toBe(false);
  });

  it('builds param options with a selected flag for a shape that has a param', () => {
    const room = { id: 2, w: 6, h: 6, shape: { type: 'l', params: { corner: 'se' } } };
    const context = buildDetailContext(room);
    expect(context.hasParam).toBe(true);
    expect(context.paramLabel).toBe('Canto');
    const seOption = context.paramOptions.find((o) => o.value === 'se');
    expect(seOption.selected).toBe(true);
    const nwOption = context.paramOptions.find((o) => o.value === 'nw');
    expect(nwOption.selected).toBe(false);
  });

  it('disables size steppers and includes no param options in custom mode', () => {
    const room = { id: 3, w: 4, h: 4, shape: { type: 'custom', params: { cells: [[0, 0]] } } };
    const context = buildDetailContext(room);
    expect(context.sizeSteppersDisabled).toBe(true);
    expect(context.hasParam).toBe(false);
  });
});
