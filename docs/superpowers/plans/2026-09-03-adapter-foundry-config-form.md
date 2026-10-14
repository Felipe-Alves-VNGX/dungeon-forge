# adapter-foundry Config Form + Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `packages/adapter-foundry`'s macro-only entry point with a GM-facing settings-menu form (`DungeonForgeConfigApp`, tabbed, covering the full `Config` shape) that generates a floor-plan preview (`DungeonForgePreviewApp`) before anything is created in Foundry.

**Architecture:** Two `ApplicationV2` + `HandlebarsApplicationMixin` classes, wired together (Config → submit → Preview; Preview → "Voltar e ajustar" → Config) via one static import in each direction, plus a small Foundry-global-free helper module (`src/shared/config-form.js`) that does all the pure data shaping — translating the form's flat, dot-named fields to/from the nested `Config` object `@dungeon-forge/core`'s `generateDungeon` expects. The two `ApplicationV2` classes themselves cannot run outside a real Foundry client (they reference `foundry.applications.api` at module-load time), so their own automated tests use a minimal in-repo stub (`test/helpers/foundry-stub.js`) that only provides enough surface for `class X extends HandlebarsApplicationMixin(ApplicationV2)` to load and `_prepareContext()` to run — real interactive behavior (rendering, click dispatch, the actual preview image) is verified manually against a live local Foundry install, matching this package's existing testing convention (`test/v13.test.js` mocks Foundry globals directly on `globalThis` the same way).

**Tech Stack:** Vanilla JS ES modules, Foundry VTT v13 `ApplicationV2`/`HandlebarsApplicationMixin`, Handlebars templates, Vitest, npm workspaces, esbuild (existing bundler for this package).

**Spec:** `docs/superpowers/specs/2026-09-03-adapter-foundry-config-form-design.md`

## Global Constraints

- `Math.random` is banned repo-wide. The "Gerar de novo" reroll feature must NOT use it — derive a new seed deterministically from the current seed plus a monotonically incrementing counter (`nextRerollSeed`, Task 1).
- Zero behavior change to the existing macro/API path (`packages/adapter-foundry/src/index.js`'s `generate(config)` export and its `unsupported target` guard) — this plan only adds a new entry point alongside it.
- Every file that touches `foundry.applications.api` at module-evaluation time (not inside a function/method body) must be guarded so importing it in plain Node (Vitest, no real Foundry) does not throw. The existing codebase's convention for this is `if (typeof Hooks !== 'undefined') { ... }` around any Foundry-only top-level side effect (see current `src/index.js`) — Tasks 2-4 below extend that same convention to the two new `ApplicationV2` files and their consumption from `index.js`.
- All new pure logic (anything not depending on `foundry.applications.api`, `game`, `ui`, or `Hooks`) lives in `src/shared/`, matching this package's existing split (`src/shared/geometry.js`, `src/shared/icons.js`, `src/shared/key-journal.js` are all Foundry-global-free and directly unit tested; `src/v13.js` is the only file that touches Foundry globals, and it does so only inside function bodies, never at module-evaluation time).
- Portuguese-language GM-facing strings (labels, button text, notifications) — matches the existing macro's `ui.notifications.info` message and this package's `README.md`/`module.json` conventions, all in Portuguese.

---

### Task 1: `src/shared/config-form.js` — pure form ⇄ Config translation

**Files:**
- Create: `packages/adapter-foundry/src/shared/config-form.js`
- Create: `packages/adapter-foundry/test/shared/config-form.test.js`

**Interfaces:**
- Produces: `DEFAULT_CONFIG` (object, the full default `Config` — including `target: 'v13'` and `gridSize: 100`, both consumed today by `src/v13.js`'s `emitV13`/`createFloorScenes` but not present in `@dungeon-forge/core`'s minimal `Config` typedef — same extension the existing macro's `EXAMPLE_CONFIG` already uses), `SHAPE_WEIGHT_TYPES` (`['rect', 'l', 'cross', 'circle', 'triangle']`), `KEY_SCHEME_OPTIONS` (`[{value, label}]` for the 3 `key.scheme` values), `configFromFormData(formObject)` (flat/nested form object → full `Config`), `formDataFromConfig(config)` (`Config` → the shape templates render, including `shapeWeight` and `schemeOptions` derived fields), `nextRerollSeed(seed, rerollCount)` (deterministic, no `Math.random`).
- Consumes: nothing new — pure JS, no imports beyond what's inlined below.

- [ ] **Step 1: Write the failing tests**

Create `packages/adapter-foundry/test/shared/config-form.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/shared/config-form.test.js`
Expected: FAIL — `../../src/shared/config-form.js` does not exist yet.

- [ ] **Step 3: Implement `src/shared/config-form.js`**

```js
// packages/adapter-foundry/src/shared/config-form.js
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
  for (const entry of shapes ?? DEFAULT_CONFIG.rooms.shapes) {
    weights[entry.type] = entry.weight;
  }
  return weights;
}

/** @param {Object} formObject — flat/nested object matching this module's field names (e.g. Foundry's `FormDataExtended#object`) */
export function configFromFormData(formObject) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/shared/config-form.test.js`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-foundry/src/shared/config-form.js packages/adapter-foundry/test/shared/config-form.test.js
git commit -m "feat(adapter-foundry): add pure Config <-> form-data translation helpers"
```

---

### Task 2: `DungeonForgePreviewApp`

**Files:**
- Create: `packages/adapter-foundry/test/helpers/foundry-stub.js`
- Create: `packages/adapter-foundry/src/preview-app.js`
- Create: `packages/adapter-foundry/templates/preview.hbs`
- Create: `packages/adapter-foundry/test/preview-app.test.js`

**Interfaces:**
- Consumes: `nextRerollSeed`, `DEFAULT_CONFIG` from `./shared/config-form.js` (Task 1); `generateDungeon` from `@dungeon-forge/core`; `renderFloor` from `@dungeon-forge/render`; `emitV13` from `./v13.js` (already exists).
- Produces: `DungeonForgePreviewApp` (class, constructor `{ dungeon, config, ...options }`) — consumed by Task 3's `DungeonForgeConfigApp` (on submit) and by `index.js`'s settings-menu entry point only indirectly (Config → Preview, never Preview → menu directly).
- `DungeonForgePreviewApp`'s "Voltar e ajustar" action imports `DungeonForgeConfigApp` from `./config-app.js` **dynamically** (`await import('./config-app.js')`, inside the action handler, not a top-level import) — Task 3 creates that file; a static top-level import here would create a circular module dependency between this task and the next, and would also make `preview-app.js` fail to load in this task's own tests since `config-app.js` doesn't exist yet.

- [ ] **Step 1: Create the minimal Foundry `ApplicationV2` stub used by this package's `ApplicationV2`-subclass tests**

```js
// packages/adapter-foundry/test/helpers/foundry-stub.js
//
// Minimal stand-in for foundry.applications.api so an ApplicationV2
// subclass can be imported and constructed in plain Node, and its pure
// data-shaping methods (_prepareContext) unit tested — NOT a behavioral
// mock of ApplicationV2's real rendering/lifecycle (_onRender, actual DOM
// dispatch). Those stay verified manually against a live local Foundry,
// same as this package's existing Foundry-global tests in
// test/v13.test.js (which stub globalThis.Scene/JournalEntry directly).
class StubApplicationV2 {
  constructor(options = {}) {
    this.options = options;
  }
}

function stubHandlebarsApplicationMixin(Base) {
  return Base;
}

export function installFoundryStub() {
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: StubApplicationV2,
        HandlebarsApplicationMixin: stubHandlebarsApplicationMixin,
      },
    },
  };
}

export function uninstallFoundryStub() {
  delete globalThis.foundry;
}
```

- [ ] **Step 2: Write the failing tests**

```js
// packages/adapter-foundry/test/preview-app.test.js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/preview-app.test.js`
Expected: FAIL — `../src/preview-app.js` does not exist yet.

- [ ] **Step 4: Implement `src/preview-app.js`**

```js
// packages/adapter-foundry/src/preview-app.js
//
// The no-commitment preview step between DungeonForgeConfigApp's form
// submission and a real Foundry emitV13() call. UX pattern credited to
// DunGen (https://github.com/mouse0270/foundryvtt-dungen) — see
// docs/superpowers/specs/2026-09-03-adapter-foundry-config-form-design.md.
import { generateDungeon } from '@dungeon-forge/core';
import { renderFloor } from '@dungeon-forge/render';
import { emitV13 } from './v13.js';
import { nextRerollSeed } from './shared/config-form.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DungeonForgePreviewApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'dungeon-forge-preview',
    window: { title: 'Pré-visualizar Masmorra', resizable: true },
    position: { width: 560, height: 480 },
    actions: {
      reroll: DungeonForgePreviewApp.#onReroll,
      back: DungeonForgePreviewApp.#onBack,
      editRooms: DungeonForgePreviewApp.#onEditRooms,
      create: DungeonForgePreviewApp.#onCreate,
    },
  };

  static PARTS = {
    body: { template: 'modules/dungeon-forge/templates/preview.hbs' },
  };

  constructor({ dungeon, config, ...options }) {
    super(options);
    this.dungeon = dungeon;
    this.config = config;
    this.floor = 0;
    this.rerollCount = 0;
    this.imageUrl = null;
  }

  async _prepareContext() {
    const floorOptions = Array.from({ length: this.dungeon.floors }, (_, i) => ({
      value: i, label: `Andar ${i + 1}`, selected: i === this.floor,
    }));
    return {
      seed: this.config.seed,
      showFloorSelector: this.dungeon.floors > 1,
      floorOptions,
      imageUrl: this.imageUrl,
    };
  }

  async _onRender() {
    const { blob } = await renderFloor(this.dungeon, this.floor, this.config.gridSize);
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = URL.createObjectURL(blob);
    const img = this.element.querySelector('[data-preview-image]');
    if (img) img.src = this.imageUrl;

    const select = this.element.querySelector('[data-floor-select]');
    if (select) {
      select.addEventListener('change', async (event) => {
        this.floor = Number(event.target.value);
        await this.render();
      });
    }
  }

  static async #onReroll() {
    this.rerollCount += 1;
    this.config = { ...this.config, seed: nextRerollSeed(this.config.seed, this.rerollCount) };
    this.dungeon = generateDungeon(this.config);
    this.floor = 0;
    await this.render();
  }

  static async #onBack() {
    const { DungeonForgeConfigApp } = await import('./config-app.js');
    await this.close();
    new DungeonForgeConfigApp({ config: this.config }).render(true);
  }

  static async #onEditRooms() {
    // Sub-project C (separate plan, not yet implemented) replaces this
    // with DungeonForgeRoomEditorApp — see
    // docs/superpowers/specs/2026-09-03-adapter-foundry-room-editor-design.md.
    ui.notifications.warn('Editor de salas ainda não implementado.');
  }

  static async #onCreate() {
    const result = await emitV13(this.dungeon, this.config);
    ui.notifications.info(`Dungeon Forge: criado "${result.journal.name}" com ${result.scenes.length} Scene(s).`);
    await this.close();
  }
}
```

- [ ] **Step 5: Create `templates/preview.hbs`**

```handlebars
<div class="dungeon-forge-preview">
  <header class="preview-header">
    <span class="preview-seed">Seed: {{seed}}</span>
    {{#if showFloorSelector}}
      <select data-floor-select>
        {{#each floorOptions}}
          <option value="{{this.value}}" {{#if this.selected}}selected{{/if}}>{{this.label}}</option>
        {{/each}}
      </select>
    {{/if}}
  </header>
  <img class="preview-image" data-preview-image src="{{imageUrl}}" alt="Pré-visualização da masmorra">
  <footer class="preview-actions">
    <button type="button" data-action="reroll">Gerar de novo</button>
    <button type="button" data-action="back">Voltar e ajustar</button>
    <button type="button" data-action="editRooms">Editar salas</button>
    <button type="button" data-action="create">Criar no Foundry</button>
  </footer>
</div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/preview-app.test.js`
Expected: PASS, all 3 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/adapter-foundry/test/helpers/foundry-stub.js packages/adapter-foundry/src/preview-app.js packages/adapter-foundry/templates/preview.hbs packages/adapter-foundry/test/preview-app.test.js
git commit -m "feat(adapter-foundry): add DungeonForgePreviewApp"
```

---

### Task 3: `DungeonForgeConfigApp`

**Files:**
- Create: `packages/adapter-foundry/src/config-app.js`
- Create: `packages/adapter-foundry/templates/config-tabs.hbs`
- Create: `packages/adapter-foundry/templates/config-general.hbs`
- Create: `packages/adapter-foundry/templates/config-rooms.hbs`
- Create: `packages/adapter-foundry/templates/config-corridors.hbs`
- Create: `packages/adapter-foundry/templates/config-stairs.hbs`
- Create: `packages/adapter-foundry/templates/config-key.hbs`
- Create: `packages/adapter-foundry/test/config-app.test.js`

**Interfaces:**
- Consumes: `configFromFormData`, `formDataFromConfig`, `DEFAULT_CONFIG`, `SHAPE_WEIGHT_TYPES` from `./shared/config-form.js` (Task 1); `DungeonForgePreviewApp` from `./preview-app.js` (Task 2, static top-level import — safe now, since Task 2 already exists and never statically imports this file back); `generateDungeon` from `@dungeon-forge/core`; `installFoundryStub`/`uninstallFoundryStub` from `./helpers/foundry-stub.js` (Task 2).
- Produces: `DungeonForgeConfigApp` (class, constructor `{ config, ...options }`) — consumed by Task 4's settings-menu registration and by `preview-app.js`'s `#onBack` (already written in Task 2, via dynamic import).

- [ ] **Step 1: Write the failing tests**

```js
// packages/adapter-foundry/test/config-app.test.js
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/config-app.test.js`
Expected: FAIL — `../src/config-app.js` does not exist yet.

- [ ] **Step 3: Implement `src/config-app.js`**

```js
// packages/adapter-foundry/src/config-app.js
//
// Tabbed ApplicationV2 form covering the full Config shape — see
// docs/superpowers/specs/2026-09-03-adapter-foundry-config-form-design.md.
// PARTS/TABS/data-action structure follows the DCC system's documented
// ApplicationV2 reference (https://github.com/foundryvtt-dcc/dcc,
// docs/dev/V13.md): each tab is its own PART, and action dispatch uses
// the data-action -> static-handler map instead of activateListeners.
import { generateDungeon } from '@dungeon-forge/core';
import { configFromFormData, formDataFromConfig, DEFAULT_CONFIG, SHAPE_WEIGHT_TYPES } from './shared/config-form.js';
import { DungeonForgePreviewApp } from './preview-app.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DungeonForgeConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'dungeon-forge-config',
    tag: 'form',
    window: { title: 'Gerar Masmorra', resizable: true },
    position: { width: 520, height: 480 },
    form: { handler: DungeonForgeConfigApp.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {},
  };

  static PARTS = {
    tabs: { template: 'modules/dungeon-forge/templates/config-tabs.hbs' },
    general: { template: 'modules/dungeon-forge/templates/config-general.hbs' },
    rooms: { template: 'modules/dungeon-forge/templates/config-rooms.hbs' },
    corridors: { template: 'modules/dungeon-forge/templates/config-corridors.hbs' },
    stairs: { template: 'modules/dungeon-forge/templates/config-stairs.hbs' },
    key: { template: 'modules/dungeon-forge/templates/config-key.hbs' },
  };

  static TABS = {
    sheet: {
      tabs: [
        { id: 'general', group: 'sheet', label: 'Geral' },
        { id: 'rooms', group: 'sheet', label: 'Salas' },
        { id: 'corridors', group: 'sheet', label: 'Corredores' },
        { id: 'stairs', group: 'sheet', label: 'Escadas' },
        { id: 'key', group: 'sheet', label: 'Chave' },
      ],
      initial: 'general',
    },
  };

  constructor({ config, ...options } = {}) {
    super(options);
    this.config = config ?? DEFAULT_CONFIG;
  }

  async _prepareContext() {
    return {
      formData: formDataFromConfig(this.config),
      shapeWeightTypes: SHAPE_WEIGHT_TYPES,
    };
  }

  static async #onSubmit(event, form, formData) {
    const config = configFromFormData(formData.object);
    const dungeon = generateDungeon(config);
    await this.close();
    new DungeonForgePreviewApp({ dungeon, config }).render(true);
  }
}
```

- [ ] **Step 4: Create the tab templates**

`packages/adapter-foundry/templates/config-tabs.hbs`:
```handlebars
<nav class="sheet-tabs tabs" data-group="sheet">
  {{#each tabs}}
    <a class="item {{this.cssClass}}" data-tab="{{this.id}}" data-group="{{this.group}}">{{this.label}}</a>
  {{/each}}
</nav>
```

`packages/adapter-foundry/templates/config-general.hbs`:
```handlebars
<div class="tab" data-tab="general" data-group="sheet">
  <div class="form-group">
    <label>Seed</label>
    <input type="text" name="seed" value="{{formData.seed}}">
  </div>
  <div class="form-group">
    <label>Andares</label>
    <input type="number" name="floors" value="{{formData.floors}}" min="1" step="1">
  </div>
  <div class="form-group">
    <label>Largura</label>
    <input type="number" name="width" value="{{formData.width}}" min="1" step="1">
  </div>
  <div class="form-group">
    <label>Altura</label>
    <input type="number" name="height" value="{{formData.height}}" min="1" step="1">
  </div>
  <div class="form-group">
    <label>Tamanho da grade (px)</label>
    <input type="number" name="gridSize" value="{{formData.gridSize}}" min="10" step="10">
  </div>
</div>
```

`packages/adapter-foundry/templates/config-rooms.hbs`:
```handlebars
<div class="tab" data-tab="rooms" data-group="sheet">
  <div class="form-group">
    <label>Quantidade de salas</label>
    <input type="number" name="rooms.count" value="{{formData.rooms.count}}" min="1" step="1">
  </div>
  <div class="form-group">
    <label>Tamanho médio</label>
    <input type="number" name="rooms.sizeMean" value="{{formData.rooms.sizeMean}}" step="0.1">
  </div>
  <div class="form-group">
    <label>Desvio padrão do tamanho</label>
    <input type="number" name="rooms.sizeStdDev" value="{{formData.rooms.sizeStdDev}}" step="0.1">
  </div>
  <div class="form-group">
    <label>Tamanho mínimo</label>
    <input type="number" name="rooms.sizeMin" value="{{formData.rooms.sizeMin}}" min="1" step="1">
  </div>
  <div class="form-group">
    <label>Tamanho máximo</label>
    <input type="number" name="rooms.sizeMax" value="{{formData.rooms.sizeMax}}" min="1" step="1">
  </div>
  <div class="form-group">
    <label>Raio de posicionamento</label>
    <input type="number" name="rooms.spawnRadius" value="{{formData.rooms.spawnRadius}}" step="0.1">
  </div>
  <div class="form-group">
    <label>Iterações de separação</label>
    <input type="number" name="rooms.separationIters" value="{{formData.rooms.separationIters}}" min="0" step="1">
  </div>
  <fieldset>
    <legend>Pesos de formato de sala</legend>
    {{#each shapeWeightTypes}}
      <div class="form-group">
        <label>{{this}}</label>
        <input type="number" name="shapeWeight.{{this}}" value="{{lookup ../formData.shapeWeight this}}" min="0" step="1">
      </div>
    {{/each}}
  </fieldset>
</div>
```

`packages/adapter-foundry/templates/config-corridors.hbs`:
```handlebars
<div class="tab" data-tab="corridors" data-group="sheet">
  <div class="form-group">
    <label>Taxa de ciclos</label>
    <input type="number" name="cycleRate" value="{{formData.cycleRate}}" min="0" max="1" step="0.01">
  </div>
  <div class="form-group">
    <label>Custo: novo corredor</label>
    <input type="number" name="carve.newHallway" value="{{formData.carve.newHallway}}" step="1">
  </div>
  <div class="form-group">
    <label>Custo: reaproveitar corredor</label>
    <input type="number" name="carve.reuseHallway" value="{{formData.carve.reuseHallway}}" step="1">
  </div>
  <div class="form-group">
    <label>Custo: atravessar sala</label>
    <input type="number" name="carve.throughRoom" value="{{formData.carve.throughRoom}}" step="1">
  </div>
  <div class="form-group">
    <label>Custo: virar</label>
    <input type="number" name="carve.turn" value="{{formData.carve.turn}}" step="1">
  </div>
  <div class="form-group">
    <label>Iterações de poda</label>
    <input type="number" name="pruneIterations" value="{{formData.pruneIterations}}" min="0" step="1">
  </div>
</div>
```

`packages/adapter-foundry/templates/config-stairs.hbs`:
```handlebars
<div class="tab" data-tab="stairs" data-group="sheet">
  <div class="form-group">
    <label>Ligações verticais por vão</label>
    <input type="number" name="verticalLinksPerGap" value="{{formData.verticalLinksPerGap}}" min="0" step="1">
  </div>
</div>
```

`packages/adapter-foundry/templates/config-key.hbs`:
```handlebars
<div class="tab" data-tab="key" data-group="sheet">
  <div class="form-group">
    <label>Esquema</label>
    <select name="key.scheme">
      {{#each formData.schemeOptions}}
        <option value="{{this.value}}" {{#if this.selected}}selected{{/if}}>{{this.label}}</option>
      {{/each}}
    </select>
  </div>
  <div class="form-group">
    <label>
      <input type="checkbox" name="key.numberJunctions" {{#if formData.key.numberJunctions}}checked{{/if}}>
      Numerar junções
    </label>
  </div>
  <div class="form-group">
    <label>Começar em</label>
    <input type="number" name="key.startAt" value="{{formData.key.startAt}}" min="0" step="1">
  </div>
  <div class="form-group">
    <label>Preencher até</label>
    <input type="number" name="key.padTo" value="{{formData.key.padTo}}" min="0" step="1">
  </div>
  <div class="form-group">
    <label>
      <input type="checkbox" name="key.exitsInEntries" {{#if formData.key.exitsInEntries}}checked{{/if}}>
      Saídas nas entradas
    </label>
  </div>
</div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/config-app.test.js`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-foundry/src/config-app.js packages/adapter-foundry/templates/config-*.hbs packages/adapter-foundry/test/config-app.test.js
git commit -m "feat(adapter-foundry): add DungeonForgeConfigApp"
```

---

### Task 4: Wire the settings menu, credits, final verification

**Files:**
- Modify: `packages/adapter-foundry/src/index.js`
- Modify: `packages/adapter-foundry/README.md`
- Modify: `packages/adapter-foundry/test/index.test.js`

**Interfaces:**
- Consumes: `DungeonForgeConfigApp` from `./config-app.js` (Task 3) — imported **dynamically** inside the `Hooks.once('init', ...)` callback, not at module top level. `index.js` is imported directly (statically) by `test/index.test.js` in plain Node, and `config-app.js` requires `foundry.applications.api` to exist at its own module-evaluation time — a top-level import here would break that existing test the same way it would have broken `preview-app.js` in Task 2.

- [ ] **Step 1: Update `src/index.js` to register the settings menu**

Read the current file first — it's 23 lines, shown here for reference (Task 1-3 haven't touched it):

```js
// packages/adapter-foundry/src/index.js
//
// Foundry module entry point (module.json's esmodules[0]). Registers the
// generate() API on the module's own game.modules entry, per Foundry's
// standard module-API convention — a macro (see ../macros/gerar-masmorra.js)
// calls game.modules.get('dungeon-forge').api.generate(config); the GM can
// also open a graphical form via the module's settings menu (registered
// below), which walks generate -> preview -> emitV13 through
// DungeonForgeConfigApp / DungeonForgePreviewApp instead.
import { generateDungeon } from '@dungeon-forge/core';
import { emitV13 } from './v13.js';

export async function generate(config) {
  if (config.target !== 'v13') {
    throw new Error(`adapter-foundry: unsupported target "${config.target}" (only 'v13' implemented)`);
  }
  const dungeon = generateDungeon(config);
  return emitV13(dungeon, config);
}

if (typeof Hooks !== 'undefined') {
  Hooks.once('init', async () => {
    game.modules.get('dungeon-forge').api = { generate };

    const { DungeonForgeConfigApp } = await import('./config-app.js');
    game.settings.registerMenu('dungeon-forge', 'generate', {
      name: 'Gerar Masmorra',
      label: 'Abrir',
      icon: 'fas fa-dungeon',
      type: DungeonForgeConfigApp,
      restricted: true,
    });
  });
}
```

- [ ] **Step 2: Add a regression test confirming `index.js` stays importable without any Foundry globals**

Append to `packages/adapter-foundry/test/index.test.js` (the existing `generate` describe block stays unchanged above this):

```js

describe('module init (Node import safety)', () => {
  it('imports src/index.js without touching foundry.applications.api at module scope', async () => {
    // If index.js ever imports config-app.js statically at the top level
    // instead of dynamically inside Hooks.once, this import itself throws
    // here (foundry.applications.api doesn't exist in plain Node) — see
    // this package's ./helpers/foundry-stub.js and preview-app.js/config-app.js
    // for why those two files must guard the same way.
    await expect(import('../src/index.js')).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: Run the full package test suite**

Run: `npx vitest run packages/adapter-foundry`
Expected: PASS — all pre-existing tests plus this task's new one.

- [ ] **Step 4: Add the Credits section to `README.md`**

Append to `packages/adapter-foundry/README.md` (after the existing "Dev deployment" section):

```markdown

## Credits

The GM-facing config form + preview flow (`DungeonForgeConfigApp` /
`DungeonForgePreviewApp`) was designed after researching these existing
Foundry modules/systems:

- **[DunGen](https://github.com/mouse0270/foundryvtt-dungen)** (MIT
  license, by mouse0270) — the "generate → preview → Create Scene" flow:
  nothing is created in Foundry until the GM explicitly commits to a
  result they've already seen.
- **[Dungeon Crawl Classics (DCC) system](https://github.com/foundryvtt-dcc/dcc)**
  — its documented `ApplicationV2` + `HandlebarsApplicationMixin`
  reference (`docs/dev/V13.md`) is the technical pattern this module's
  tabbed form follows: `DEFAULT_OPTIONS`/`PARTS`/`TABS` static fields, the
  `data-action` handler-mapping convention, and one `PART` per tab.
```

- [ ] **Step 5: Full workspace regression check**

Run: `npx vitest run` and `npm run lint` from the repo root.
Expected: both clean — no regression anywhere else in the monorepo from these changes.

- [ ] **Step 6: Manual smoke check against a live local Foundry**

The `ApplicationV2` classes themselves (rendering, tab switching, button
clicks, the actual preview image) are not exercised by the automated
suite — only their pure `_prepareContext` data shaping is (Tasks 2-3). If
a live local Foundry v13 install is available in this environment (per
this package's `README.md` "Dev deployment" — symlink
`packages/adapter-foundry` into `<foundry-data>/Data/modules/dungeon-forge`,
then `npm run build --workspace=@dungeon-forge/adapter-foundry`):

1. Reload the world, open the module's settings menu, launch "Gerar
   Masmorra".
2. Confirm all 5 tabs render and switch correctly, and every field from
   `DEFAULT_CONFIG` shows its default value.
3. Submit the form — confirm `DungeonForgePreviewApp` opens showing a
   rendered floor-plan image, not an error.
4. Click "Gerar de novo" — confirm the image changes (different seed,
   same other params).
5. Click "Voltar e ajustar" — confirm `DungeonForgeConfigApp` reopens
   pre-filled with the values that produced the current preview (not the
   defaults).
6. Click "Editar salas" — confirm the "ainda não implementado" warning
   notification appears (Sub-project C replaces this later) rather than
   an error.
7. Click "Criar no Foundry" — confirm the same real-document creation
   already established for the macro path (JournalEntry + Scenes) happens
   for real this time, and the preview window closes.

If no live browser/Foundry install is available in this execution
environment, skip this step but say so explicitly in the task report —
do not claim it as verified. At minimum, run
`grep -rn "foundry\.applications\.api" packages/adapter-foundry/src/` and
confirm only `config-app.js` and `preview-app.js` reference it, both
exactly once, at their own top level (not inside `index.js` or
`shared/config-form.js`).

- [ ] **Step 7: Commit**

```bash
git add packages/adapter-foundry/src/index.js packages/adapter-foundry/test/index.test.js packages/adapter-foundry/README.md
git commit -m "feat(adapter-foundry): register settings-menu entry point for the config form; credit DunGen and DCC"
```

---

## Final check

Run `npx vitest run` and `npm run lint` from the repo root once more after
all four tasks — both must be clean before moving to whole-branch review.
