// packages/adapter-foundry/test/shared/config-form.test.js
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG, SHAPE_WEIGHT_TYPES, KEY_SCHEME_OPTIONS,
  configFromFormData, formDataFromConfig, nextRerollSeed,
} from '../../src/shared/config-form.js';

describe('DEFAULT_CONFIG', () => {
  it('always targets v13 and has exactly one default shape (rect)', () => {
    expect(DEFAULT_CONFIG.target).toBe('v13');
    expect(DEFAULT_CONFIG.rooms.shapes).toEqual([{ type: 'rect', weight: 1 }]);
  });
});

describe('configFromFormData', () => {
  function fullFormObject(overrides = {}) {
    return {
      seed: 'meu-seed', floors: 3, width: 40, height: 40, gridSize: 90,
      rooms: {
        count: 8, sizeMean: 6, sizeStdDev: 2, sizeMin: 3, sizeMax: 12,
        spawnRadius: 15, separationIters: 50,
      },
      shapeWeight: { rect: 1, l: 2, cross: 0, circle: 0, triangle: 0 },
      cycleRate: 0.3,
      carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
      pruneIterations: 6,
      verticalLinksPerGap: 1,
      key: { scheme: 'flat', numberJunctions: true, startAt: 2, padTo: 3, exitsInEntries: false },
      ...overrides,
    };
  }

  it('builds a full Config from a complete form object, always forcing target v13', () => {
    const config = configFromFormData(fullFormObject());
    expect(config.target).toBe('v13');
    expect(config.seed).toBe('meu-seed');
    expect(config.floors).toBe(3);
    expect(config.gridSize).toBe(90);
    expect(config.rooms.count).toBe(8);
    expect(config.carve).toEqual({ newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 });
    expect(config.key).toEqual({ scheme: 'flat', numberJunctions: true, startAt: 2, padTo: 3, exitsInEntries: false });
  });

  it('builds rooms.shapes from the positive-weight entries only, preserving declared order', () => {
    const config = configFromFormData(fullFormObject());
    expect(config.rooms.shapes).toEqual([{ type: 'rect', weight: 1 }, { type: 'l', weight: 2 }]);
  });

  it('falls back to a single default rect shape when every weight is zero', () => {
    const config = configFromFormData(fullFormObject({
      shapeWeight: { rect: 0, l: 0, cross: 0, circle: 0, triangle: 0 },
    }));
    expect(config.rooms.shapes).toEqual([{ type: 'rect', weight: 1 }]);
  });

  it('falls back to the default seed when the form seed is empty', () => {
    const config = configFromFormData(fullFormObject({ seed: '' }));
    expect(config.seed).toBe(DEFAULT_CONFIG.seed);
  });
});

describe('formDataFromConfig', () => {
  it('round-trips a full Config into form shape and back into an equivalent Config', () => {
    const original = configFromFormData({
      seed: 'roundtrip', floors: 2, width: 30, height: 30, gridSize: 100,
      rooms: { count: 5, sizeMean: 5, sizeStdDev: 1, sizeMin: 3, sizeMax: 9, spawnRadius: 10, separationIters: 30 },
      shapeWeight: { rect: 1, l: 0, cross: 3, circle: 0, triangle: 0 },
      cycleRate: 0.2,
      carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
      pruneIterations: 5,
      verticalLinksPerGap: 2,
      key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
    });
    const formData = formDataFromConfig(original);
    expect(formData.shapeWeight).toEqual({ rect: 1, l: 0, cross: 3, circle: 0, triangle: 0 });
    const rebuilt = configFromFormData(formData);
    expect(rebuilt).toEqual(original);
  });

  it('marks the current key.scheme as selected among schemeOptions', () => {
    const config = { ...DEFAULT_CONFIG, key: { ...DEFAULT_CONFIG.key, scheme: 'alpha-floor' } };
    const formData = formDataFromConfig(config);
    expect(formData.schemeOptions).toEqual(
      KEY_SCHEME_OPTIONS.map((opt) => ({ ...opt, selected: opt.value === 'alpha-floor' }))
    );
  });
});

describe('nextRerollSeed', () => {
  it('is deterministic for the same seed and reroll count', () => {
    expect(nextRerollSeed('base', 1)).toBe(nextRerollSeed('base', 1));
  });

  it('differs across reroll counts for the same base seed', () => {
    expect(nextRerollSeed('base', 1)).not.toBe(nextRerollSeed('base', 2));
  });
});
