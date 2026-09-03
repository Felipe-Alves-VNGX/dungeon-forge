// packages/adapter-foundry/macros/gerar-masmorra.js
//
// Example Foundry Macro (type: "script"). Not loaded automatically — a GM
// imports this into a Macro document to try the module. Uses a small,
// fast config so it's cheap to re-run while iterating.
const EXAMPLE_CONFIG = {
  target: 'v13',
  seed: 'macro-teste',
  floors: 2,
  width: 40, height: 40,
  rooms: { count: 6, sizeMean: 6, sizeStdDev: 1.5, sizeMin: 4, sizeMax: 10, spawnRadius: 14, separationIters: 40 },
  cycleRate: 0.15,
  verticalLinksPerGap: 1,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  gridSize: 100,
  key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

const { journal, scenes } = await game.modules.get('dungeon-forge').api.generate(EXAMPLE_CONFIG);
ui.notifications.info(`Dungeon Forge: criado "${journal.name}" com ${scenes.length} Scene(s).`);
