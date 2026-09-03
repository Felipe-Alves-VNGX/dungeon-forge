import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installFoundryStub, uninstallFoundryStub } from './helpers/foundry-stub.js';

let DungeonForgeRoomEditorApp;

beforeAll(async () => {
  installFoundryStub();
  ({ DungeonForgeRoomEditorApp } = await import('../src/room-editor-app.js'));
});

afterAll(() => {
  uninstallFoundryStub();
});

function dungeonFixture() {
  return {
    width: 20, height: 20,
    rooms: [
      { id: 1, floor: 0, x: 0, y: 0, w: 6, h: 6, cx: 3, cy: 3, shape: { type: 'rect', params: {} } },
      { id: 2, floor: 0, x: 10, y: 0, w: 3, h: 3, cx: 11.5, cy: 1.5, shape: { type: 'rect', params: {} } },
    ],
    areas: [
      { roomId: 1, label: '1-01' },
      { roomId: 2, label: '1-02' },
    ],
  };
}

describe('DungeonForgeRoomEditorApp', () => {
  it('selects the first room by default and exposes its detail context', async () => {
    const app = new DungeonForgeRoomEditorApp({ dungeon: dungeonFixture() });
    const context = await app._prepareContext();
    expect(app.selectedRoomId).toBe(1);
    expect(context.detail.roomId).toBe(1);
    expect(context.roomsByFloor).toEqual([
      { floor: 1, rooms: [
        { id: 1, label: '1-01', active: true },
        { id: 2, label: '1-02', active: false },
      ] },
    ]);
  });

  it('returns a null detail context when no room is selected (empty dungeon)', async () => {
    const app = new DungeonForgeRoomEditorApp({ dungeon: { width: 20, height: 20, rooms: [], areas: [] } });
    const context = await app._prepareContext();
    expect(context.detail).toBeNull();
  });

  it('calls onClose when the app closes', async () => {
    let closed = false;
    const app = new DungeonForgeRoomEditorApp({ dungeon: dungeonFixture(), onClose: () => { closed = true; } });
    await app.close();
    expect(closed).toBe(true);
  });
});
