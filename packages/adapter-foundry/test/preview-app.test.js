import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installFoundryStub, uninstallFoundryStub } from './helpers/foundry-stub.js';

let DungeonForgePreviewApp;

beforeAll(async () => {
  installFoundryStub();
  ({ DungeonForgePreviewApp } = await import('../src/preview-app.js'));
});

afterAll(() => {
  uninstallFoundryStub();
});

function dungeon(floors) {
  return { floors, rooms: [], walls: [], doors: [], areas: [], links: [] };
}

function config() {
  return { target: 'v13', seed: 'preview-seed', gridSize: 100 };
}

describe('DungeonForgePreviewApp', () => {
  it('starts on floor 0 with no image yet, and hides the floor selector for a 1-floor dungeon', async () => {
    const app = new DungeonForgePreviewApp({ dungeon: dungeon(1), config: config() });
    const context = await app._prepareContext();
    expect(context.showFloorSelector).toBe(false);
    expect(context.imageUrl).toBeNull();
    expect(context.floorOptions).toEqual([{ value: 0, label: 'Andar 1', selected: true }]);
  });

  it('shows the floor selector with one option per floor for a multi-floor dungeon', async () => {
    const app = new DungeonForgePreviewApp({ dungeon: dungeon(3), config: config() });
    const context = await app._prepareContext();
    expect(context.showFloorSelector).toBe(true);
    expect(context.floorOptions).toEqual([
      { value: 0, label: 'Andar 1', selected: true },
      { value: 1, label: 'Andar 2', selected: false },
      { value: 2, label: 'Andar 3', selected: false },
    ]);
  });

  it('carries the config seed into the rendered context', async () => {
    const app = new DungeonForgePreviewApp({ dungeon: dungeon(1), config: config() });
    const context = await app._prepareContext();
    expect(context.seed).toBe('preview-seed');
  });
});
