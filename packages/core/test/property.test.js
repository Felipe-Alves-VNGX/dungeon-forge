import { describe, it, expect } from 'vitest';
import { generateDungeon } from '../src/pipeline.js';
import { validateDungeon } from '../src/validate.js';

// SPEC.md §6 mandates running the validator over 10,000 seeds in CI. That's
// too slow for the inner dev loop, so the count is configurable — set
// DUNGEON_FORGE_PROPERTY_SEEDS=10000 in CI, leave the smaller default locally.
const SEED_COUNT = Number(process.env.DUNGEON_FORGE_PROPERTY_SEEDS ?? 200);

const CONFIG = {
  floors: 2,
  width: 30,
  height: 30,
  rooms: { count: 6, sizeMean: 6, sizeStdDev: 2, sizeMin: 3, sizeMax: 10, spawnRadius: 12, separationIters: 40 },
  cycleRate: 0.25,
  verticalLinksPerGap: 1,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

describe(`validator property test (${SEED_COUNT} seeds)`, () => {
  it('every seed produces a Dungeon with zero validator errors', () => {
    const failures = [];
    for (let i = 0; i < SEED_COUNT; i++) {
      const seed = `property-seed-${i}`;
      const dungeon = generateDungeon({ ...CONFIG, seed });
      const result = validateDungeon(dungeon);
      if (!result.ok) {
        failures.push({ seed, errors: result.errors });
      }
    }
    if (failures.length > 0) {
      const preview = failures.slice(0, 5)
        .map((f) => `${f.seed}: ${f.errors.map((e) => `[${e.code}] ${e.message}`).join('; ')}`)
        .join('\n');
      throw new Error(`${failures.length}/${SEED_COUNT} seeds failed validation:\n${preview}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
