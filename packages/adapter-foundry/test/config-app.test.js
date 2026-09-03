import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installFoundryStub, uninstallFoundryStub } from './helpers/foundry-stub.js';
import { DEFAULT_CONFIG, SHAPE_WEIGHT_TYPES } from '../src/shared/config-form.js';

let DungeonForgeConfigApp;

beforeAll(async () => {
  installFoundryStub();
  ({ DungeonForgeConfigApp } = await import('../src/config-app.js'));
});

afterAll(() => {
  uninstallFoundryStub();
});

describe('DungeonForgeConfigApp', () => {
  it('defaults to DEFAULT_CONFIG when constructed with no config', async () => {
    const app = new DungeonForgeConfigApp();
    const context = await app._prepareContext();
    expect(context.formData.seed).toBe(DEFAULT_CONFIG.seed);
    expect(context.formData.rooms.count).toBe(DEFAULT_CONFIG.rooms.count);
  });

  it('pre-fills form data from a given config (the "Voltar e ajustar" path)', async () => {
    const config = { ...DEFAULT_CONFIG, seed: 'ajustar-seed', floors: 5 };
    const app = new DungeonForgeConfigApp({ config });
    const context = await app._prepareContext();
    expect(context.formData.seed).toBe('ajustar-seed');
    expect(context.formData.floors).toBe(5);
  });

  it('exposes the shape weight types for the Rooms tab template', async () => {
    const app = new DungeonForgeConfigApp();
    const context = await app._prepareContext();
    expect(context.shapeWeightTypes).toEqual(SHAPE_WEIGHT_TYPES);
  });

  it('marks the initial tab (general) active when tabGroups is not yet set', async () => {
    const app = new DungeonForgeConfigApp();
    const context = await app._prepareContext();
    expect(context.tabs.general.active).toBe(true);
    expect(context.tabs.general.cssClass).toBe('active');
    expect(context.tabs.rooms.active).toBe(false);
    expect(context.tabs.rooms.cssClass).toBe('');
    expect(Object.keys(context.tabs)).toEqual(['general', 'rooms', 'corridors', 'stairs', 'key']);
  });
});
