//
// Pure translation between DungeonForgeConfigApp's form fields and the
// Config shape @dungeon-forge/core's generateDungeon expects. No Foundry
// globals used here, so this stays importable and testable in plain Node
// — same convention as ./geometry.js, ./icons.js, ./key-journal.js.
//
// gridSize and target aren't part of @dungeon-forge/core's Config typedef
// (packages/core/src/types.js) — they're adapter-foundry-only extensions
// already used by src/v13.js and by the existing example macro
// (macros/gerar-masmorra.js's EXAMPLE_CONFIG).

export const SHAPE_WEIGHT_TYPES = ['rect', 'l', 'cross', 'circle', 'triangle'];

export const KEY_SCHEME_OPTIONS = [
  { value: 'flat', label: 'Flat' },
  { value: 'per-floor', label: 'Por andar' },
  { value: 'alpha-floor', label: 'Alfa por andar' },
];

export const DEFAULT_CONFIG = {
  target: 'v13',
  seed: 'nova-masmorra',
  floors: 2,
  width: 50,
  height: 50,
  gridSize: 100,
  rooms: {
    count: 9, sizeMean: 7, sizeStdDev: 2.5, sizeMin: 3, sizeMax: 14,
    spawnRadius: 18, separationIters: 60,
    shapes: [{ type: 'rect', weight: 1 }],
  },
  cycleRate: 0.25,
  verticalLinksPerGap: 2,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

function shapesFromWeights(weights) {
  const shapes = SHAPE_WEIGHT_TYPES
    .map((type) => ({ type, weight: Number(weights?.[type] ?? 0) }))
    .filter((entry) => entry.weight > 0);
  return shapes.length > 0 ? shapes : [{ type: 'rect', weight: 1 }];
}

function weightsFromShapes(shapes) {
  const weights = Object.fromEntries(SHAPE_WEIGHT_TYPES.map((type) => [type, 0]));
  const source = (shapes && shapes.length > 0) ? shapes : DEFAULT_CONFIG.rooms.shapes;
  for (const entry of source) {
    weights[entry.type] = entry.weight;
  }
  return weights;
}

// Foundry's FormDataExtended#object delivers a FLAT object with dot-keyed
// property names (e.g. "rooms.count", "carve.turn") for nested form field
// names, not a nested object. This expands that shape into the nested
// object configFromFormData expects — idempotent on already-nested input
// (a key with no "." in it is copied through unchanged), so it's safe to
// always call, regardless of what shape the caller passes.
function expandFlat(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.');
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor[parts[i]] ??= {};
      cursor = cursor[parts[i]];
    }
    cursor[parts.at(-1)] = value;
  }
  return result;
}

/** @param {Object} rawFormObject — flat/nested object matching this module's field names (e.g. Foundry's `FormDataExtended#object`) */
export function configFromFormData(rawFormObject) {
  const formObject = expandFlat(rawFormObject);
  return {
    target: 'v13',
    seed: formObject.seed || DEFAULT_CONFIG.seed,
    floors: Number(formObject.floors),
    width: Number(formObject.width),
    height: Number(formObject.height),
    gridSize: Number(formObject.gridSize),
    rooms: {
      count: Number(formObject.rooms.count),
      sizeMean: Number(formObject.rooms.sizeMean),
      sizeStdDev: Number(formObject.rooms.sizeStdDev),
      sizeMin: Number(formObject.rooms.sizeMin),
      sizeMax: Number(formObject.rooms.sizeMax),
      spawnRadius: Number(formObject.rooms.spawnRadius),
      separationIters: Number(formObject.rooms.separationIters),
      shapes: shapesFromWeights(formObject.shapeWeight),
    },
    cycleRate: Number(formObject.cycleRate),
    verticalLinksPerGap: Number(formObject.verticalLinksPerGap),
    carve: {
      newHallway: Number(formObject.carve.newHallway),
      reuseHallway: Number(formObject.carve.reuseHallway),
      throughRoom: Number(formObject.carve.throughRoom),
      turn: Number(formObject.carve.turn),
    },
    pruneIterations: Number(formObject.pruneIterations),
    key: {
      scheme: formObject.key.scheme,
      numberJunctions: Boolean(formObject.key.numberJunctions),
      startAt: Number(formObject.key.startAt),
      padTo: Number(formObject.key.padTo),
      exitsInEntries: Boolean(formObject.key.exitsInEntries),
    },
  };
}

export function formDataFromConfig(config) {
  return {
    seed: config.seed,
    floors: config.floors,
    width: config.width,
    height: config.height,
    gridSize: config.gridSize,
    rooms: {
      count: config.rooms.count,
      sizeMean: config.rooms.sizeMean,
      sizeStdDev: config.rooms.sizeStdDev,
      sizeMin: config.rooms.sizeMin,
      sizeMax: config.rooms.sizeMax,
      spawnRadius: config.rooms.spawnRadius,
      separationIters: config.rooms.separationIters,
    },
    shapeWeight: weightsFromShapes(config.rooms.shapes),
    cycleRate: config.cycleRate,
    verticalLinksPerGap: config.verticalLinksPerGap,
    carve: { ...config.carve },
    pruneIterations: config.pruneIterations,
    key: { ...config.key },
    schemeOptions: KEY_SCHEME_OPTIONS.map((opt) => ({ ...opt, selected: opt.value === config.key.scheme })),
  };
}

export function nextRerollSeed(seed, rerollCount) {
  return `${seed}::reroll-${rerollCount}`;
}
