// packages/core/test/property.test.js
//
// SPEC.md §9 "Propriedade" / §6's closing note: "O validador roda em CI
// sobre 10.000 seeds." Running the full 10k on every `npm test` would make
// the everyday loop slow, so this file runs a much smaller sample (still
// covering single- and multi-floor configs, several key schemes, and a
// couple of room counts) on every run, and the full 10k count is available
// via DUNGEON_FORGE_PROPERTY_SEEDS for CI or a manual check:
//
//   DUNGEON_FORGE_PROPERTY_SEEDS=10000 npx vitest run test/property.test.js
import { describe, it, expect } from 'vitest';
import { generateDungeon } from '../src/pipeline.js';
import { validateDungeon } from '../src/validate.js';

const SEED_COUNT = Number(process.env.DUNGEON_FORGE_PROPERTY_SEEDS) || 30;

const ROOM_PARAMS = { count: 9, sizeMean: 7, sizeStdDev: 2.5, sizeMin: 3, sizeMax: 14, spawnRadius: 18, separationIters: 60 };
const CARVE = { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 };

const CONFIGS = [
  {
    label: 'single-floor, per-floor scheme',
    floors: 1, width: 50, height: 50, rooms: ROOM_PARAMS, cycleRate: 0.25, verticalLinksPerGap: 2,
    carve: CARVE, pruneIterations: 8,
    key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
  },
  {
    label: 'multi-floor, per-floor scheme',
    floors: 3, width: 50, height: 50, rooms: ROOM_PARAMS, cycleRate: 0.25, verticalLinksPerGap: 2,
    carve: CARVE, pruneIterations: 8,
    key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
  },
  {
    label: 'multi-floor, alpha-floor scheme',
    floors: 4, width: 50, height: 50, rooms: ROOM_PARAMS, cycleRate: 0.4, verticalLinksPerGap: 3,
    carve: CARVE, pruneIterations: 8,
    key: { scheme: 'alpha-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
  },
  {
    label: 'single-floor, flat scheme, dense rooms',
    floors: 1, width: 60, height: 60,
    rooms: { ...ROOM_PARAMS, count: 16, spawnRadius: 24 },
    cycleRate: 0.15, verticalLinksPerGap: 2, carve: CARVE, pruneIterations: 8,
    key: { scheme: 'flat', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
  },
];

describe(`validateDungeon — property test (${SEED_COUNT} seeds x ${CONFIGS.length} configs)`, () => {
  for (const config of CONFIGS) {
    it(`zero invariant failures across ${SEED_COUNT} seeds — ${config.label}`, () => {
      const failures = [];
      for (let i = 0; i < SEED_COUNT; i++) {
        const seed = `property-${config.label}-${i}`;
        const dungeon = generateDungeon({ ...config, seed });
        const { ok, errors } = validateDungeon(dungeon);
        if (!ok) failures.push({ seed, errors });
      }
      if (failures.length > 0) {
        const summary = failures
          .slice(0, 5)
          .map((f) => `${f.seed}: ${f.errors.map((e) => e.code).join(', ')}`)
          .join('\n');
        expect.fail(`${failures.length}/${SEED_COUNT} seeds failed validation:\n${summary}`);
      }
      expect(failures).toEqual([]);
    });
  }
});
