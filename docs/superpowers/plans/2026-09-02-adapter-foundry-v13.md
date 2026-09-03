# adapter-foundry v13 Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/adapter-foundry`, a new workspace that translates a `Dungeon` (from `@dungeon-forge/core`) into real Foundry VTT v13 documents — a key JournalEntry, one Scene per floor with walls/notes, and paired teleport Regions for stairs — invocable from a Foundry macro, transactional (rolls back everything on failure).

**Architecture:** `shared/` holds Foundry-schema-agnostic-but-Foundry-shaped pure builders (wall/note field translation, key-journal page assembly) that don't touch document classes directly — testable in plain Node/Vitest with no Foundry running. `v13.js` holds the orchestration (`emitV13`) that actually calls `Scene.create`/`JournalEntry.create`/`createEmbeddedDocuments`, with rollback on failure — testable with hand-written stub classes that record calls. `index.js` is the Foundry module entry point, registering a `generate(config)` API function on `Hooks.once('init', ...)`.

**Tech Stack:** Vanilla JS ES modules (Foundry v13 loads `esmodules` directly, no bundler needed for this package — matches `packages/core`/`packages/render`'s zero-build-step convention). Vitest for unit tests. A real local Foundry v13.351 instance (confirmed reachable and drivable via Playwright in this environment) for end-to-end verification after each task that touches document creation.

**Spec:** `docs/superpowers/specs/2026-09-02-adapter-foundry-v13-design.md`

## Global Constraints

- `Math.random` is banned repo-wide — not applicable (no randomness anywhere in `adapter-foundry`; it only ever translates an already-generated `Dungeon`).
- `packages/core` gets zero changes and zero new dependencies from this plan — `adapter-foundry` only ever imports `generateDungeon`/`validateDungeon` from `@dungeon-forge/core`'s existing public surface.
- Foundry document field values use the exact schema confirmed live against Foundry v13.351 in the design doc (Wall: `c/light/move/sight/sound/dir/door/ds`; Region shape: `{type:'rectangle',x,y,width,height,hole,rotation}`; `teleportToken` behavior: `system:{destination:<uuid string>,choice:boolean}`; Note: `entryId/pageId/x/y/text/fontSize/textAnchor/texture/iconSize`). Numeric constants (`textAnchor: 0` for center, `door: 1|2` for door/secret, wall sense `20` for normal) are hardcoded directly rather than read from Foundry's `CONST` global, specifically so `shared/` stays importable and testable in plain Node/Vitest without any Foundry globals defined.
- Every task that changes what `emitV13`/`generate` actually creates gets an end-to-end verification pass against the real local Foundry (`http://localhost:30000`, world "[TEST5] Fixed door icons" already active) via Playwright — create, inspect, then delete the created documents so the test world stays clean.

---

### Task 1: Package scaffolding + `shared/geometry.js`

**Files:**
- Create: `packages/adapter-foundry/package.json`
- Create: `packages/adapter-foundry/module.json`
- Create: `packages/adapter-foundry/src/shared/geometry.js`
- Test: `packages/adapter-foundry/test/shared/geometry.test.js`
- Modify: `package.json:9` (root workspaces list) — add `"packages/adapter-foundry"` is already covered by the existing `"packages/*"` glob, no change needed; confirm this in Step 1 rather than editing.
- Modify: `vitest.workspace.js` — add `'packages/adapter-foundry'`

**Interfaces:**
- Produces: `toPixel(cell, gridSize)` — `(number, number) => number`, just `cell * gridSize`. `buildWallData(wall, doorsById, gridSize)` — `(WallSegment, Map<number, Door>, number) => Object` (a plain Foundry Wall-creation-data object). `buildNoteData(area, gridSize, pageId, journalId)` — `(Area, number, string, string) => Object` (a plain Foundry Note-creation-data object).

- [ ] **Step 1: Confirm the workspace glob already covers the new package**

Run: `cat package.json | grep -A3 workspaces`
Expected output includes `"packages/*"` — this glob already matches `packages/adapter-foundry` once it exists, so no edit to the root `package.json` is needed. If for any reason it does NOT include that glob, stop and report BLOCKED — that would mean the root `package.json` was changed since this plan was written and the plan's assumption about workspace scoping needs to be re-verified.

- [ ] **Step 2: Create `packages/adapter-foundry/package.json`**

```json
{
  "name": "@dungeon-forge/adapter-foundry",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.js",
  "dependencies": {
    "@dungeon-forge/core": "*"
  }
}
```

- [ ] **Step 3: Create `packages/adapter-foundry/module.json`**

```json
{
  "id": "dungeon-forge",
  "title": "Dungeon Forge",
  "description": "Procedurally generates multi-floor dungeons directly into Foundry VTT — Scenes, walls, key JournalEntry, and teleporting stairs.",
  "version": "0.0.1",
  "compatibility": {
    "minimum": "13",
    "verified": "13"
  },
  "esmodules": ["src/index.js"],
  "authors": []
}
```

- [ ] **Step 4: Add the package to the vitest workspace**

In `vitest.workspace.js` (repo root), add the new project:

```js
export default [
  'packages/core',
  'packages/render',
  'harness',
  'packages/adapter-foundry',
];
```

- [ ] **Step 5: Write the failing tests**

Create `packages/adapter-foundry/test/shared/geometry.test.js`:

```js
// packages/adapter-foundry/test/shared/geometry.test.js
import { describe, it, expect } from 'vitest';
import { toPixel, buildWallData, buildNoteData } from '../../src/shared/geometry.js';

describe('toPixel', () => {
  it('multiplies a cell coordinate by gridSize', () => {
    expect(toPixel(5, 100)).toBe(500);
    expect(toPixel(0, 100)).toBe(0);
  });
});

describe('buildWallData', () => {
  const gridSize = 100;

  it('builds a plain wall (isDoor false) with door:0', () => {
    const wall = { floor: 0, x1: 2, y1: 3, x2: 4, y2: 3, isDoor: false, doorId: null };
    const data = buildWallData(wall, new Map(), gridSize);
    expect(data).toEqual({
      c: [200, 300, 400, 300],
      light: 20, move: 20, sight: 20, sound: 20, dir: 0, door: 0, ds: 0,
    });
  });

  it('builds a normal door wall (isDoor true, secret false) with door:1', () => {
    const wall = { floor: 0, x1: 2, y1: 3, x2: 4, y2: 3, isDoor: true, doorId: 7 };
    const doorsById = new Map([[7, { id: 7, secret: false }]]);
    const data = buildWallData(wall, doorsById, gridSize);
    expect(data.door).toBe(1);
    expect(data.c).toEqual([200, 300, 400, 300]);
  });

  it('builds a secret door wall (isDoor true, secret true) with door:2', () => {
    const wall = { floor: 0, x1: 2, y1: 3, x2: 4, y2: 3, isDoor: true, doorId: 8 };
    const doorsById = new Map([[8, { id: 8, secret: true }]]);
    const data = buildWallData(wall, doorsById, gridSize);
    expect(data.door).toBe(2);
  });
});

describe('buildNoteData', () => {
  it('builds a Note referencing the given journal/page and centered on the area', () => {
    const area = { id: 3, label: '1-02', floor: 0, roomId: 5, cx: 10.5, cy: 8, exits: [] };
    const data = buildNoteData(area, 100, 'page123', 'journal456');
    expect(data).toEqual({
      entryId: 'journal456',
      pageId: 'page123',
      x: 1050,
      y: 800,
      text: '1-02',
      fontSize: 32,
      textAnchor: 0,
      texture: { src: 'icons/svg/village.svg' },
      iconSize: 60,
    });
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/shared/geometry.test.js`
Expected: FAIL — `packages/adapter-foundry/src/shared/geometry.js` doesn't exist yet.

- [ ] **Step 7: Implement `shared/geometry.js`**

Create `packages/adapter-foundry/src/shared/geometry.js`:

```js
// packages/adapter-foundry/src/shared/geometry.js
//
// Pure translation from dungeon-forge's cell-unit data to Foundry's
// pixel-unit document-creation data. No Foundry globals used here — every
// numeric constant below is hardcoded to the value confirmed live against
// Foundry v13.351 (see docs/superpowers/specs/2026-09-02-adapter-foundry-v13-design.md),
// specifically so this file stays importable and testable in plain Node.
//
// Notes/Regions/Walls read wall.isDoor + doorsById.get(wall.doorId)?.secret
// directly from Dungeon.walls/Dungeon.doors — NOT from
// @dungeon-forge/render's buildRenderPlan, whose isDoor flag intentionally
// masks secret doors for the baked floor-plan image. Foundry's own
// wall/vision system is what should hide a secret door from players here.

const WALL_SENSE_NORMAL = 20; // CONST.WALL_SENSE_TYPES.NORMAL
const WALL_DOOR_NONE = 0;     // CONST.WALL_DOOR_TYPES.NONE
const WALL_DOOR_DOOR = 1;     // CONST.WALL_DOOR_TYPES.DOOR
const WALL_DOOR_SECRET = 2;   // CONST.WALL_DOOR_TYPES.SECRET
const WALL_DOOR_STATE_CLOSED = 0; // CONST.WALL_DOOR_STATES.CLOSED
const WALL_DIR_BOTH = 0;      // CONST.WALL_DIRECTIONS.BOTH
const TEXT_ANCHOR_CENTER = 0; // CONST.TEXT_ANCHOR_POINTS.CENTER

const NOTE_FONT_SIZE = 32;      // SPEC.md §5.14: "derivado de gridSize, mínimo 24" — 32 covers gridSize=100 default
const NOTE_ICON_SCALE = 0.6;    // SPEC.md §5.14: iconSize = gridSize * 0.6
const ROLE_ICON_DEFAULT = 'icons/svg/village.svg'; // placeholder icon; per-role icons are shared/icons.js's job (Task 2)

export function toPixel(cell, gridSize) {
  return cell * gridSize;
}

export function buildWallData(wall, doorsById, gridSize) {
  const door = !wall.isDoor
    ? WALL_DOOR_NONE
    : (doorsById.get(wall.doorId)?.secret ? WALL_DOOR_SECRET : WALL_DOOR_DOOR);

  return {
    c: [
      toPixel(wall.x1, gridSize),
      toPixel(wall.y1, gridSize),
      toPixel(wall.x2, gridSize),
      toPixel(wall.y2, gridSize),
    ],
    light: WALL_SENSE_NORMAL,
    move: WALL_SENSE_NORMAL,
    sight: WALL_SENSE_NORMAL,
    sound: WALL_SENSE_NORMAL,
    dir: WALL_DIR_BOTH,
    door,
    ds: WALL_DOOR_STATE_CLOSED,
  };
}

export function buildNoteData(area, gridSize, pageId, journalId) {
  return {
    entryId: journalId,
    pageId,
    x: toPixel(area.cx, gridSize),
    y: toPixel(area.cy, gridSize),
    text: area.label,
    fontSize: NOTE_FONT_SIZE,
    textAnchor: TEXT_ANCHOR_CENTER,
    texture: { src: ROLE_ICON_DEFAULT },
    iconSize: Math.round(gridSize * NOTE_ICON_SCALE),
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/shared/geometry.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 9: Run the full workspace suite to confirm zero regression**

Run: `npx vitest run`
Expected: all existing tests still pass, plus the 5 new ones.

- [ ] **Step 10: Commit**

```bash
git add package.json vitest.workspace.js packages/adapter-foundry/package.json packages/adapter-foundry/module.json packages/adapter-foundry/src/shared/geometry.js packages/adapter-foundry/test/shared/geometry.test.js
git commit -m "feat(adapter-foundry): scaffold package + shared wall/note data builders"
```

---

### Task 2: `shared/icons.js` + `shared/key-journal.js`

**Files:**
- Create: `packages/adapter-foundry/src/shared/icons.js`
- Create: `packages/adapter-foundry/src/shared/key-journal.js`
- Test: `packages/adapter-foundry/test/shared/icons.test.js`
- Test: `packages/adapter-foundry/test/shared/key-journal.test.js`

**Interfaces:**
- Consumes: `Dungeon.areas` (`Area[]`), `Dungeon.key` (`{entries: KeyEntry[], legend: LegendSymbol[]}`) from `@dungeon-forge/core`.
- Produces: `iconForRole(role)` — `(RoomRole) => string` (an icon path). `createKeyJournal(dungeon, config)` — `(Dungeon, Config) => Promise<JournalEntry>` (a real Foundry document — calls the global `JournalEntry.create(...)`). `mapAreaPagesById(journal, dungeon)` — `(JournalEntry, Dungeon) => Map<number, string>` (`Area.id -> pageId`).

- [ ] **Step 1: Write the failing test for `icons.js`**

Create `packages/adapter-foundry/test/shared/icons.test.js`:

```js
// packages/adapter-foundry/test/shared/icons.test.js
import { describe, it, expect } from 'vitest';
import { iconForRole } from '../../src/shared/icons.js';

describe('iconForRole', () => {
  it('returns a distinct icon path for each of the 5 known roles', () => {
    const roles = ['entrance', 'climax', 'treasure', 'junction', 'filler'];
    const icons = roles.map(iconForRole);
    expect(new Set(icons).size).toBe(5); // all distinct
    for (const icon of icons) expect(icon).toMatch(/^icons\/svg\/.+\.svg$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/adapter-foundry/test/shared/icons.test.js`
Expected: FAIL — `icons.js` doesn't exist yet.

- [ ] **Step 3: Implement `shared/icons.js`**

Create `packages/adapter-foundry/src/shared/icons.js`:

```js
// packages/adapter-foundry/src/shared/icons.js
//
// One Note icon per Room.role (SPEC.md §5.11's legend). Paths are Foundry's
// own bundled icons (icons/svg/*.svg ships with core Foundry — no asset of
// our own needed for this round).
const ROLE_ICON = {
  entrance: 'icons/svg/door-exit.svg',
  climax: 'icons/svg/skull.svg',
  treasure: 'icons/svg/chest.svg',
  junction: 'icons/svg/pawprint.svg',
  filler: 'icons/svg/village.svg',
};

export function iconForRole(role) {
  return ROLE_ICON[role] ?? ROLE_ICON.filler;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/adapter-foundry/test/shared/icons.test.js`
Expected: PASS

- [ ] **Step 5: Write the failing tests for `key-journal.js`**

Create `packages/adapter-foundry/test/shared/key-journal.test.js`. This tests against a **stub** `JournalEntry` global (no real Foundry needed) that records what it was called with and returns a fake document shaped like the real one:

```js
// packages/adapter-foundry/test/shared/key-journal.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKeyJournal, mapAreaPagesById } from '../../src/shared/key-journal.js';

function dungeon() {
  return {
    areas: [
      { id: 0, label: '1-01', floor: 0, roomId: 0, cx: 2, cy: 2, exits: [{ dir: 'e', toLabel: '1-02', via: 'door' }] },
      { id: 1, label: '1-02', floor: 0, roomId: 1, cx: 8, cy: 2, exits: [] },
    ],
    key: {
      entries: [
        { areaId: 0, label: '1-01', title: 'Entrada', description: 'Uma sala de entrada.', tags: ['entrance'] },
        { areaId: 1, label: '1-02', title: 'Câmara', description: 'Uma câmara vazia.', tags: ['filler'] },
      ],
      legend: [{ kind: 'entrance', caption: 'Entrada da masmorra' }],
    },
  };
}

describe('createKeyJournal', () => {
  beforeEach(() => {
    globalThis.JournalEntry = {
      create: vi.fn(async (data) => ({
        id: 'journal-fake-id',
        pages: { contents: data.pages.map((p, i) => ({ id: `page-${i}`, name: p.name })) },
      })),
    };
  });

  it('creates one page per Area plus a Legenda page, titled "{label} — {title}"', async () => {
    const journal = await createKeyJournal(dungeon(), { seed: 'x' });
    const call = globalThis.JournalEntry.create.mock.calls[0][0];
    expect(call.pages).toHaveLength(3); // 2 areas + Legenda
    expect(call.pages[0].name).toBe('Legenda');
    expect(call.pages[1].name).toBe('1-01 — Entrada');
    expect(call.pages[2].name).toBe('1-02 — Câmara');
    expect(journal.id).toBe('journal-fake-id');
  });

  it('every non-Legenda page text content includes the description and exit list', async () => {
    await createKeyJournal(dungeon(), { seed: 'x' });
    const call = globalThis.JournalEntry.create.mock.calls[0][0];
    expect(call.pages[1].text.content).toContain('Uma sala de entrada.');
    expect(call.pages[1].text.content).toContain('1-02'); // exit destination label
    expect(call.pages[2].text.content).toContain('Uma câmara vazia.');
  });
});

describe('mapAreaPagesById', () => {
  it('maps Area.id to the created page id by matching page name to area label prefix', () => {
    const journal = {
      pages: {
        contents: [
          { id: 'page-legend', name: 'Legenda' },
          { id: 'page-0', name: '1-01 — Entrada' },
          { id: 'page-1', name: '1-02 — Câmara' },
        ],
      },
    };
    const map = mapAreaPagesById(journal, dungeon());
    expect(map.get(0)).toBe('page-0');
    expect(map.get(1)).toBe('page-1');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/shared/key-journal.test.js`
Expected: FAIL — `key-journal.js` doesn't exist yet.

- [ ] **Step 7: Implement `shared/key-journal.js`**

Create `packages/adapter-foundry/src/shared/key-journal.js`:

```js
// packages/adapter-foundry/src/shared/key-journal.js
//
// Builds the "Chave" JournalEntry: one page per Area (so a GM can grant
// per-page ownership as the party discovers each area — SPEC.md §5.14),
// plus a Legenda page. Page names are "{label} — {title}", which
// mapAreaPagesById uses afterward to recover Area.id -> pageId (JournalEntry
// pages don't carry an arbitrary custom-data field in this Foundry version
// without a system-specific data model, so the name itself is the join key
// — every Area.label in a Dungeon is unique by construction).
const JOURNAL_FORMAT_HTML = 1; // CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML

function pageNameForArea(area, entry) {
  return `${area.label} — ${entry.title}`;
}

function pageContentForArea(area, entry) {
  const exitsHtml = area.exits.length === 0
    ? '<p><em>Sem saídas.</em></p>'
    : `<ul>${area.exits.map((e) => `<li>${e.dir} → ${e.toLabel} (${e.via})</li>`).join('')}</ul>`;
  return `<p>${entry.description}</p>${exitsHtml}`;
}

function legendPageContent(legend) {
  const rows = legend.map((s) => `<li><strong>${s.kind}</strong>: ${s.caption}</li>`).join('');
  return `<ul>${rows}</ul>`;
}

export async function createKeyJournal(dungeon, config) {
  const entriesByAreaId = new Map(dungeon.key.entries.map((e) => [e.areaId, e]));

  const areaPages = dungeon.areas.map((area) => {
    const entry = entriesByAreaId.get(area.id);
    return {
      name: pageNameForArea(area, entry),
      type: 'text',
      text: { content: pageContentForArea(area, entry), format: JOURNAL_FORMAT_HTML },
    };
  });

  const legendPage = {
    name: 'Legenda',
    type: 'text',
    text: { content: legendPageContent(dungeon.key.legend), format: JOURNAL_FORMAT_HTML },
  };

  return JournalEntry.create({
    name: `Chave — ${config.seed}`,
    pages: [legendPage, ...areaPages],
  });
}

export function mapAreaPagesById(journal, dungeon) {
  const entriesByAreaId = new Map(dungeon.key.entries.map((e) => [e.areaId, e]));
  const pageIdByName = new Map(journal.pages.contents.map((p) => [p.name, p.id]));

  const map = new Map();
  for (const area of dungeon.areas) {
    const entry = entriesByAreaId.get(area.id);
    const pageId = pageIdByName.get(pageNameForArea(area, entry));
    map.set(area.id, pageId);
  }
  return map;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/shared/key-journal.test.js packages/adapter-foundry/test/shared/icons.test.js`
Expected: PASS (all tests)

- [ ] **Step 9: Run the full workspace suite to confirm zero regression**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 10: E2E verification against the real local Foundry**

Using the Playwright tools already connected to `http://localhost:30000` in this session (world "[TEST5] Fixed door icons" is active), run this directly in the browser console via `page.evaluate` (this task doesn't yet wire the module into Foundry's module loader — that's Task 5 — so verify the shared functions work against the real `JournalEntry` class by loading them as a raw ES module import in the page context):

```js
async (page) => {
  return await page.evaluate(async () => {
    const mod = await import('/modules/dungeon-forge/src/shared/key-journal.js');
    // This import will 404 until Task 5's symlink exists — if so, skip this
    // step for now and note in the report that it's deferred to Task 5's
    // E2E pass, which covers the same code path end-to-end anyway.
  });
}
```

Since the module isn't deployed into Foundry's `Data/modules/` yet at this point in the plan (that's Task 5), skip this step now — note in the task report that `shared/key-journal.js`'s real-Foundry verification is covered by Task 5's E2E pass instead, and that Task 2's own coverage is the stub-based unit tests above (Step 5-8), which already exercise the exact page-creation shape `createKeyJournal` sends to `JournalEntry.create`.

- [ ] **Step 11: Commit**

```bash
git add packages/adapter-foundry/src/shared/icons.js packages/adapter-foundry/src/shared/key-journal.js packages/adapter-foundry/test/shared/icons.test.js packages/adapter-foundry/test/shared/key-journal.test.js
git commit -m "feat(adapter-foundry): key JournalEntry construction + role icons"
```

---

### Task 3: `v13.js` — `createFloorScenes`

**Files:**
- Create: `packages/adapter-foundry/src/v13.js`
- Test: `packages/adapter-foundry/test/v13.test.js`

**Interfaces:**
- Consumes: `buildWallData`, `buildNoteData`, `toPixel` (Task 1); `iconForRole` (Task 2, used inside `buildNoteData`'s texture — see Step 3 below, which updates `buildNoteData`'s call site to pass the icon in rather than hardcoding it).
- Produces: `createFloorScenes(dungeon, config, pageIdByAreaId)` — `(Dungeon, Config, Map<number,string>) => Promise<Scene[]>` (real Foundry documents, one per floor, index-aligned with `[0..dungeon.floors)`).

- [ ] **Step 1: Update `buildNoteData`'s call site to use the real per-role icon**

Task 1's `buildNoteData` hardcoded a single icon path as a placeholder (`ROLE_ICON_DEFAULT`) because `iconForRole` didn't exist yet. Now that it does (Task 2), update `packages/adapter-foundry/src/shared/geometry.js`: change `buildNoteData`'s signature to accept the room role and use `iconForRole`:

```js
import { iconForRole } from './icons.js';

// ... toPixel, buildWallData unchanged ...

export function buildNoteData(area, gridSize, pageId, journalId, role) {
  return {
    entryId: journalId,
    pageId,
    x: toPixel(area.cx, gridSize),
    y: toPixel(area.cy, gridSize),
    text: area.label,
    fontSize: NOTE_FONT_SIZE,
    textAnchor: TEXT_ANCHOR_CENTER,
    texture: { src: iconForRole(role) },
    iconSize: Math.round(gridSize * NOTE_ICON_SCALE),
  };
}
```

Remove the now-unused `ROLE_ICON_DEFAULT` constant. Update `packages/adapter-foundry/test/shared/geometry.test.js`'s `buildNoteData` test to pass a role and assert the icon matches `iconForRole`:

```js
import { iconForRole } from '../../src/shared/icons.js';

// replace the existing buildNoteData describe block's test with:
it('builds a Note referencing the given journal/page, centered on the area, with the role icon', () => {
  const area = { id: 3, label: '1-02', floor: 0, roomId: 5, cx: 10.5, cy: 8, exits: [] };
  const data = buildNoteData(area, 100, 'page123', 'journal456', 'treasure');
  expect(data).toEqual({
    entryId: 'journal456',
    pageId: 'page123',
    x: 1050,
    y: 800,
    text: '1-02',
    fontSize: 32,
    textAnchor: 0,
    texture: { src: iconForRole('treasure') },
    iconSize: 60,
  });
});
```

Run `npx vitest run packages/adapter-foundry/test/shared/geometry.test.js` and confirm it passes with this change before continuing.

- [ ] **Step 2: Write the failing test for `createFloorScenes`**

Create `packages/adapter-foundry/test/v13.test.js`:

```js
// packages/adapter-foundry/test/v13.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFloorScenes } from '../src/v13.js';

function dungeon() {
  return {
    width: 20, height: 20, floors: 2,
    walls: [
      { floor: 0, x1: 0, y1: 0, x2: 2, y2: 0, isDoor: false, doorId: null },
      { floor: 1, x1: 0, y1: 0, x2: 2, y2: 0, isDoor: false, doorId: null },
    ],
    doors: [],
    areas: [
      { id: 0, label: '1-01', floor: 0, roomId: 0, cx: 2, cy: 2, exits: [] },
      { id: 1, label: '2-01', floor: 1, roomId: 1, cx: 2, cy: 2, exits: [] },
    ],
    rooms: [
      { id: 0, floor: 0, x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, role: 'entrance', doors: [] },
      { id: 1, floor: 1, x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, role: 'climax', doors: [] },
    ],
    links: [
      { id: 0, fromFloor: 0, toFloor: 1, x: 5, y: 5, w: 2, h: 1, kind: 'stair', roomIdFrom: 0, roomIdTo: 1 },
    ],
  };
}

describe('createFloorScenes', () => {
  beforeEach(() => {
    globalThis.Scene = {
      create: vi.fn(async (data) => ({ id: `scene-${data.name}`, name: data.name, _createData: data })),
    };
  });

  it('creates one Scene per floor, named by floor number', async () => {
    const pageIdByAreaId = new Map([[0, 'page-0'], [1, 'page-1']]);
    const scenes = await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId);
    expect(scenes).toHaveLength(2);
    expect(globalThis.Scene.create).toHaveBeenCalledTimes(2);
    const [floor0Call, floor1Call] = globalThis.Scene.create.mock.calls.map((c) => c[0]);
    expect(floor0Call.name).toContain('1'); // 1-indexed floor label per SPEC.md
    expect(floor1Call.name).toContain('2');
  });

  it('includes exactly the walls belonging to that floor, translated to pixels', async () => {
    const pageIdByAreaId = new Map([[0, 'page-0'], [1, 'page-1']]);
    await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId);
    const [floor0Call] = globalThis.Scene.create.mock.calls.map((c) => c[0]);
    expect(floor0Call.walls).toHaveLength(1);
    expect(floor0Call.walls[0].c).toEqual([0, 0, 200, 0]);
  });

  it('includes one Note per Area on that floor, referencing the right page id', async () => {
    const pageIdByAreaId = new Map([[0, 'page-0'], [1, 'page-1']]);
    await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId);
    const [floor0Call] = globalThis.Scene.create.mock.calls.map((c) => c[0]);
    expect(floor0Call.notes).toHaveLength(1);
    expect(floor0Call.notes[0].pageId).toBe('page-0');
    expect(floor0Call.notes[0].text).toBe('1-01');
  });

  it('includes one Region per VerticalLink touching that floor, tagged with the link id in flags', async () => {
    const pageIdByAreaId = new Map([[0, 'page-0'], [1, 'page-1']]);
    await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId);
    const [floor0Call, floor1Call] = globalThis.Scene.create.mock.calls.map((c) => c[0]);
    expect(floor0Call.regions).toHaveLength(1);
    expect(floor1Call.regions).toHaveLength(1);
    expect(floor0Call.regions[0].flags['dungeon-forge'].linkId).toBe(0);
    expect(floor1Call.regions[0].flags['dungeon-forge'].linkId).toBe(0);
    expect(floor0Call.regions[0].shapes[0]).toEqual({ type: 'rectangle', x: 500, y: 500, width: 200, height: 100 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/v13.test.js`
Expected: FAIL — `packages/adapter-foundry/src/v13.js` doesn't exist yet.

- [ ] **Step 4: Implement `createFloorScenes` in `v13.js`**

Create `packages/adapter-foundry/src/v13.js`:

```js
// packages/adapter-foundry/src/v13.js
//
// v13 target: N Scenes (one per floor), each with real walls/notes and
// stair Regions (geometry only at first — see wireStairRegionBehaviors,
// which adds the paired teleport behavior once every floor's Scene
// exists, since a Region's teleport destination is the *other* floor's
// Region UUID, unknowable until that Scene has been created).
import { buildWallData, buildNoteData } from './shared/geometry.js';

function sceneNameForFloor(dungeon, floor, config) {
  return `${config.seed} — Andar ${floor + 1}`;
}

function regionShapeForLink(link, gridSize) {
  return {
    type: 'rectangle',
    x: link.x * gridSize,
    y: link.y * gridSize,
    width: link.w * gridSize,
    height: link.h * gridSize,
  };
}

export async function createFloorScenes(dungeon, config, pageIdByAreaId) {
  const gridSize = config.gridSize ?? 100;
  const doorsById = new Map((dungeon.doors ?? []).map((d) => [d.id, d]));
  const rolesByRoomId = new Map(dungeon.rooms.map((r) => [r.id, r.role]));

  const scenes = [];
  for (let floor = 0; floor < dungeon.floors; floor++) {
    const walls = dungeon.walls
      .filter((w) => w.floor === floor)
      .map((w) => buildWallData(w, doorsById, gridSize));

    const notes = dungeon.areas
      .filter((a) => a.floor === floor)
      .map((a) => {
        const pageId = pageIdByAreaId.get(a.id);
        const role = rolesByRoomId.get(a.roomId) ?? 'filler';
        return buildNoteData(a, gridSize, pageId, /* journalId set by caller below */ undefined, role);
      });

    const regions = dungeon.links
      .filter((link) => link.fromFloor === floor || link.toFloor === floor)
      .map((link) => ({
        name: `stair-${link.id}`,
        shapes: [regionShapeForLink(link, gridSize)],
        flags: { 'dungeon-forge': { linkId: link.id } },
      }));

    const scene = await Scene.create({
      name: sceneNameForFloor(dungeon, floor, config),
      width: dungeon.width * gridSize,
      height: dungeon.height * gridSize,
      grid: { size: gridSize, type: 1 },
      background: { src: null },
      walls,
      notes,
      regions,
    });
    scenes.push(scene);
  }
  return scenes;
}
```

**Note on `journalId`:** `buildNoteData`'s 4th argument (`journalId`) is left `undefined` here deliberately — it's filled in by `emitV13` in Task 4, which knows the journal's real id and passes it down. Task 3's tests above only assert on `pageId`/`text`, not `entryId`, so this doesn't need to be threaded through yet; Task 4 either updates this call site to accept the journal id as a `createFloorScenes` parameter, or (simpler, chosen here) `emitV13` post-processes the returned `notes` arrays — **do not implement that resolution now**; Task 4's own steps handle it explicitly. Leave this exactly as shown.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/v13.test.js`
Expected: PASS (all 4 tests)

- [ ] **Step 6: Run the full workspace suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: E2E verification against the real local Foundry**

Using the Playwright tools connected to `http://localhost:30000`, run via `page.evaluate` in the live world's console context (this directly exercises the same `Scene.create` call shape `createFloorScenes` produces, without needing the module deployed yet):

```js
async (page) => {
  return await page.evaluate(async () => {
    const scene = await Scene.create({
      name: 'probe-task3-floor1',
      width: 2000, height: 2000,
      grid: { size: 100, type: 1 },
      background: { src: null },
      walls: [{ c: [0, 0, 200, 0], light: 20, move: 20, sight: 20, sound: 20, dir: 0, door: 0, ds: 0 }],
      notes: [],
      regions: [{ name: 'stair-0', shapes: [{ type: 'rectangle', x: 500, y: 500, width: 200, height: 100 }], flags: { 'dungeon-forge': { linkId: 0 } } }],
    });
    const result = { wallsCount: scene.walls.size, regionsCount: scene.regions.size, linkFlag: scene.regions.contents[0].flags['dungeon-forge'].linkId };
    await scene.delete();
    return result;
  });
}
```
Expected result: `{ wallsCount: 1, regionsCount: 1, linkFlag: 0 }`, confirming the exact shape `createFloorScenes` builds round-trips correctly through real Foundry document creation, and that `flags['dungeon-forge'].linkId` survives the round trip (needed by Task 4's `wireStairRegionBehaviors` to find matching Region pairs).

- [ ] **Step 8: Commit**

```bash
git add packages/adapter-foundry/src/shared/geometry.js packages/adapter-foundry/test/shared/geometry.test.js packages/adapter-foundry/src/v13.js packages/adapter-foundry/test/v13.test.js
git commit -m "feat(adapter-foundry): createFloorScenes — per-floor Scene with walls/notes/stair-region-geometry"
```

---

### Task 4: `v13.js` — `wireStairRegionBehaviors` + `emitV13` orchestration

**Files:**
- Modify: `packages/adapter-foundry/src/v13.js`
- Modify: `packages/adapter-foundry/test/v13.test.js`

**Interfaces:**
- Consumes: `createKeyJournal`, `mapAreaPagesById` (Task 2); `createFloorScenes` (Task 3, this task also fixes its `journalId` threading — see Step 1).
- Produces: `wireStairRegionBehaviors(scenes, dungeon)` — `(Scene[], Dungeon) => Promise<void>` (mutates via `createEmbeddedDocuments`, doesn't return anything new). `emitV13(dungeon, config)` — `(Dungeon, Config) => Promise<{journal, scenes}>`, the plan's main deliverable, with full rollback on any failure.

- [ ] **Step 1: Thread `journalId` through `createFloorScenes`**

`createFloorScenes` (Task 3) left `buildNoteData`'s `journalId` argument `undefined`. Fix this now by adding a 4th parameter to `createFloorScenes` itself. In `packages/adapter-foundry/src/v13.js`, change the function signature and the one call site that builds notes:

```js
export async function createFloorScenes(dungeon, config, pageIdByAreaId, journalId) {
  // ... unchanged until the notes mapping:
    const notes = dungeon.areas
      .filter((a) => a.floor === floor)
      .map((a) => {
        const pageId = pageIdByAreaId.get(a.id);
        const role = rolesByRoomId.get(a.roomId) ?? 'filler';
        return buildNoteData(a, gridSize, pageId, journalId, role);
      });
  // ... rest unchanged
}
```

Update `packages/adapter-foundry/test/v13.test.js`'s existing `createFloorScenes` describe block: every call site that invokes `createFloorScenes(dungeon(), config, pageIdByAreaId)` gains a 4th argument, `'journal-fake-id'`:

```js
const scenes = await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId, 'journal-fake-id');
```

(Apply this same 4th argument to all 4 existing test cases in that describe block.) Add one assertion confirming it's actually used, inside the "includes one Note per Area" test:

```js
    expect(floor0Call.notes[0].entryId).toBe('journal-fake-id');
```

Run `npx vitest run packages/adapter-foundry/test/v13.test.js` and confirm all 4 existing tests still pass with this change before continuing.

- [ ] **Step 2: Write the failing tests for `wireStairRegionBehaviors` and `emitV13`**

Append to `packages/adapter-foundry/test/v13.test.js`:

```js
import { createFloorScenes as _cfs, wireStairRegionBehaviors, emitV13 } from '../src/v13.js';
```

(Add this import alongside the existing `createFloorScenes` import at the top of the file, or merge into one import statement — either is fine, just don't duplicate the import of `createFloorScenes`.)

```js
describe('wireStairRegionBehaviors', () => {
  function fakeScene(name, regionId, linkId) {
    const behaviorCreate = vi.fn(async (docType, [data]) => ({ ...data, id: `${regionId}-behavior` }));
    return {
      name,
      uuid: `Scene.${name}`,
      regions: {
        contents: [{
          id: regionId,
          uuid: `Scene.${name}.Region.${regionId}`,
          flags: { 'dungeon-forge': { linkId } },
          createEmbeddedDocuments: behaviorCreate,
        }],
      },
    };
  }

  it('wires each VerticalLink\'s two Regions to teleport to each other\'s UUID', async () => {
    const sceneA = fakeScene('floor0', 'region-a', 0);
    const sceneB = fakeScene('floor1', 'region-b', 0);
    await wireStairRegionBehaviors([sceneA, sceneB], { links: [{ id: 0, fromFloor: 0, toFloor: 1 }] });

    const regionA = sceneA.regions.contents[0];
    const regionB = sceneB.regions.contents[0];
    expect(regionA.createEmbeddedDocuments).toHaveBeenCalledWith('RegionBehavior', [
      { name: 'teleport', type: 'teleportToken', system: { destination: 'Scene.floor1.Region.region-b', choice: false } },
    ]);
    expect(regionB.createEmbeddedDocuments).toHaveBeenCalledWith('RegionBehavior', [
      { name: 'teleport', type: 'teleportToken', system: { destination: 'Scene.floor0.Region.region-a', choice: false } },
    ]);
  });
});

describe('emitV13', () => {
  function stubGlobals({ failAt } = {}) {
    const journalDelete = vi.fn(async () => {});
    globalThis.JournalEntry = {
      create: vi.fn(async () => {
        if (failAt === 'journal') throw new Error('journal creation failed');
        return { id: 'journal-1', pages: { contents: [{ id: 'p0', name: 'Legenda' }] }, delete: journalDelete };
      }),
    };
    const sceneDeletes = [];
    globalThis.Scene = {
      create: vi.fn(async (data) => {
        if (failAt === 'scene') throw new Error('scene creation failed');
        const del = vi.fn(async () => {});
        sceneDeletes.push(del);
        return {
          id: `scene-${data.name}`, name: data.name,
          regions: { contents: (data.regions ?? []).map((r, i) => ({ id: `r${i}`, uuid: `uuid-r${i}`, flags: r.flags, createEmbeddedDocuments: vi.fn(async () => { if (failAt === 'behavior') throw new Error('behavior wiring failed'); return []; }) })) },
          delete: del,
        };
      }),
    };
    return { journalDelete, sceneDeletes };
  }

  it('returns {journal, scenes} on success', async () => {
    stubGlobals();
    const dungeon = { areas: [], key: { entries: [], legend: [] }, walls: [], doors: [], rooms: [], links: [], width: 10, height: 10, floors: 1 };
    const result = await emitV13(dungeon, { seed: 'x', gridSize: 100 });
    expect(result.journal.id).toBe('journal-1');
    expect(result.scenes).toHaveLength(1);
  });

  it('rolls back nothing extra if JournalEntry.create itself fails', async () => {
    stubGlobals({ failAt: 'journal' });
    const dungeon = { areas: [], key: { entries: [], legend: [] }, walls: [], doors: [], rooms: [], links: [], width: 10, height: 10, floors: 1 };
    await expect(emitV13(dungeon, { seed: 'x' })).rejects.toThrow('journal creation failed');
  });

  it('deletes the journal if Scene creation fails', async () => {
    const { journalDelete } = stubGlobals({ failAt: 'scene' });
    const dungeon = { areas: [], key: { entries: [], legend: [] }, walls: [], doors: [], rooms: [], links: [], width: 10, height: 10, floors: 1 };
    await expect(emitV13(dungeon, { seed: 'x' })).rejects.toThrow('scene creation failed');
    expect(journalDelete).toHaveBeenCalledTimes(1);
  });

  it('deletes the journal AND all scenes if behavior wiring fails', async () => {
    const { journalDelete, sceneDeletes } = stubGlobals({ failAt: 'behavior' });
    const dungeon = {
      areas: [], key: { entries: [], legend: [] }, walls: [], doors: [], rooms: [], width: 10, height: 10, floors: 2,
      links: [{ id: 0, fromFloor: 0, toFloor: 1 }],
    };
    await expect(emitV13(dungeon, { seed: 'x' })).rejects.toThrow('behavior wiring failed');
    expect(journalDelete).toHaveBeenCalledTimes(1);
    expect(sceneDeletes.every((d) => d.mock.calls.length === 1)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/v13.test.js`
Expected: FAIL — `wireStairRegionBehaviors` and `emitV13` don't exist yet.

- [ ] **Step 4: Implement `wireStairRegionBehaviors` and `emitV13`**

Append to `packages/adapter-foundry/src/v13.js` (add these imports at the top alongside the existing ones):

```js
import { createKeyJournal, mapAreaPagesById } from './shared/key-journal.js';
```

```js
export async function wireStairRegionBehaviors(scenes, dungeon) {
  const regionByLinkId = new Map();
  for (const scene of scenes) {
    for (const region of scene.regions.contents) {
      const linkId = region.flags?.['dungeon-forge']?.linkId;
      if (linkId === undefined) continue;
      if (!regionByLinkId.has(linkId)) regionByLinkId.set(linkId, []);
      regionByLinkId.get(linkId).push(region);
    }
  }

  for (const link of dungeon.links) {
    const [regionA, regionB] = regionByLinkId.get(link.id) ?? [];
    if (!regionA || !regionB) continue; // shouldn't happen for a valid Dungeon; nothing to wire otherwise
    await regionA.createEmbeddedDocuments('RegionBehavior', [
      { name: 'teleport', type: 'teleportToken', system: { destination: regionB.uuid, choice: false } },
    ]);
    await regionB.createEmbeddedDocuments('RegionBehavior', [
      { name: 'teleport', type: 'teleportToken', system: { destination: regionA.uuid, choice: false } },
    ]);
  }
}

export async function emitV13(dungeon, config) {
  const journal = await createKeyJournal(dungeon, config);
  try {
    const pageIdByAreaId = mapAreaPagesById(journal, dungeon);
    const scenes = await createFloorScenes(dungeon, config, pageIdByAreaId, journal.id);
    try {
      await wireStairRegionBehaviors(scenes, dungeon);
    } catch (err) {
      await Promise.all(scenes.map((s) => s.delete()));
      throw err;
    }
    return { journal, scenes };
  } catch (err) {
    await journal.delete();
    throw err;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/v13.test.js`
Expected: PASS (all tests, including the 4 `emitV13` cases and 1 `wireStairRegionBehaviors` case)

- [ ] **Step 6: Run the full workspace suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: E2E verification against the real local Foundry**

Using the Playwright tools connected to `http://localhost:30000`, run via `page.evaluate` — this directly exercises `wireStairRegionBehaviors`'s exact real-document call shape (two real Scenes, real Regions tagged with `linkId`, wired to teleport to each other's real UUID):

```js
async (page) => {
  return await page.evaluate(async () => {
    const sceneA = await Scene.create({ name: 'probe-task4-a', width: 1000, height: 1000, grid: { size: 100, type: 1 }, background: { src: null }, regions: [{ name: 'stair-0', shapes: [{ type: 'rectangle', x: 0, y: 0, width: 200, height: 100 }], flags: { 'dungeon-forge': { linkId: 0 } } }] });
    const sceneB = await Scene.create({ name: 'probe-task4-b', width: 1000, height: 1000, grid: { size: 100, type: 1 }, background: { src: null }, regions: [{ name: 'stair-0', shapes: [{ type: 'rectangle', x: 0, y: 0, width: 200, height: 100 }], flags: { 'dungeon-forge': { linkId: 0 } } }] });
    const regionA = sceneA.regions.contents[0];
    const regionB = sceneB.regions.contents[0];
    await regionA.createEmbeddedDocuments('RegionBehavior', [{ name: 'teleport', type: 'teleportToken', system: { destination: regionB.uuid, choice: false } }]);
    await regionB.createEmbeddedDocuments('RegionBehavior', [{ name: 'teleport', type: 'teleportToken', system: { destination: regionA.uuid, choice: false } }]);
    const result = {
      aDestination: sceneA.regions.contents[0].behaviors.contents[0].system.destination,
      bDestination: sceneB.regions.contents[0].behaviors.contents[0].system.destination,
      aDestinationResolvesToRealRegion: !!(await fromUuid(sceneA.regions.contents[0].behaviors.contents[0].system.destination)),
    };
    await sceneA.delete();
    await sceneB.delete();
    return result;
  });
}
```
Expected: `aDestination` equals `regionB.uuid` (a real `"Scene.<id>.Region.<id>"` string), `bDestination` equals `regionA.uuid`, and `aDestinationResolvesToRealRegion` is `true` — confirming Foundry's own `fromUuid` can resolve the cross-Scene reference, which is exactly what the real `teleportToken` behavior needs at runtime to move a token.

- [ ] **Step 8: Commit**

```bash
git add packages/adapter-foundry/src/v13.js packages/adapter-foundry/test/v13.test.js
git commit -m "feat(adapter-foundry): wireStairRegionBehaviors + emitV13 transactional orchestration"
```

---

### Task 5: `index.js` entry point, dev symlink, example macro, full E2E

**Files:**
- Create: `packages/adapter-foundry/src/index.js`
- Create: `packages/adapter-foundry/macros/gerar-masmorra.js`
- Test: `packages/adapter-foundry/test/index.test.js`

**Interfaces:**
- Consumes: `emitV13` (Task 4); `generateDungeon` from `@dungeon-forge/core`.
- Produces: the Foundry module's registered API — `game.modules.get('dungeon-forge').api.generate(config)`.

- [ ] **Step 1: Write the failing test for `generate`'s target guard**

Create `packages/adapter-foundry/test/index.test.js`:

```js
// packages/adapter-foundry/test/index.test.js
import { describe, it, expect, vi } from 'vitest';
import { generate } from '../src/index.js';

describe('generate', () => {
  it('rejects any target other than v13, without touching Foundry or core', async () => {
    await expect(generate({ target: 'v14' })).rejects.toThrow(/unsupported target "v14"/);
    await expect(generate({ target: undefined })).rejects.toThrow(/unsupported target/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/adapter-foundry/test/index.test.js`
Expected: FAIL — `index.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/index.js`**

Create `packages/adapter-foundry/src/index.js`:

```js
// packages/adapter-foundry/src/index.js
//
// Foundry module entry point (module.json's esmodules[0]). Registers the
// generate() API on the module's own game.modules entry, per Foundry's
// standard module-API convention — a macro (see ../macros/gerar-masmorra.js)
// calls game.modules.get('dungeon-forge').api.generate(config).
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
  Hooks.once('init', () => {
    game.modules.get('dungeon-forge').api = { generate };
  });
}
```

(The `typeof Hooks !== 'undefined'` guard lets this module be imported directly by Vitest, in plain Node, without a `Hooks` global defined — the `Hooks.once` registration only actually runs inside real Foundry.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/adapter-foundry/test/index.test.js`
Expected: PASS

- [ ] **Step 5: Create the example macro**

Create `packages/adapter-foundry/macros/gerar-masmorra.js`:

```js
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
```

- [ ] **Step 6: Run the full workspace suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Deploy the symlink into the local Foundry's modules folder**

```bash
ln -s "$(pwd)/packages/adapter-foundry" /home/FelipeAlves/foundry-local/data/Data/modules/dungeon-forge
```

Run: `ls -la /home/FelipeAlves/foundry-local/data/Data/modules/dungeon-forge/module.json`
Expected: the symlinked `module.json` is readable at that path.

- [ ] **Step 8: Activate the module and run a full end-to-end generation, via Playwright against the real local Foundry**

Using the Playwright tools connected to `http://localhost:30000` (world "[TEST5] Fixed door icons" already active):

1. Activate the module via Foundry's real settings API (confirmed live: the setting key is `core.moduleConfiguration`, a plain object mapping module id to a boolean active flag), then reload so `Hooks.once('init', ...)` re-runs and registers the API:
```js
async (page) => {
  await page.evaluate(async () => {
    const current = game.settings.get('core', 'moduleConfiguration');
    await game.settings.set('core', 'moduleConfiguration', { ...current, 'dungeon-forge': true });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}
```
2. After reload, confirm activation: `page.evaluate(() => game.modules.get('dungeon-forge')?.active)` should return `true`.
3. Run the actual example config end-to-end:
```js
async (page) => {
  return await page.evaluate(async () => {
    const before = { journals: game.journal.size, scenes: game.scenes.size };
    const EXAMPLE_CONFIG = {
      target: 'v13', seed: 'e2e-task5', floors: 2, width: 40, height: 40,
      rooms: { count: 6, sizeMean: 6, sizeStdDev: 1.5, sizeMin: 4, sizeMax: 10, spawnRadius: 14, separationIters: 40 },
      cycleRate: 0.15, verticalLinksPerGap: 1,
      carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
      pruneIterations: 8, gridSize: 100,
      key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
    };
    const { journal, scenes } = await game.modules.get('dungeon-forge').api.generate(EXAMPLE_CONFIG);
    const after = { journals: game.journal.size, scenes: game.scenes.size };
    const result = {
      createdOneJournal: after.journals === before.journals + 1,
      createdTwoScenes: scenes.length === 2 && after.scenes === before.scenes + 2,
      firstScene: { walls: scenes[0].walls.size, notes: scenes[0].notes.size, regions: scenes[0].regions.size },
      teleportWired: scenes[0].regions.contents[0]?.behaviors.contents[0]?.type === 'teleportToken',
    };
    // Clean up — delete everything this run created, leaving the test world as found.
    await journal.delete();
    for (const s of scenes) await s.delete();
    return result;
  });
}
```
4. Expected: `createdOneJournal: true`, `createdTwoScenes: true`, `firstScene.walls > 0`, `firstScene.regions === 1` (one stair link between 2 floors), `teleportWired: true`.

If any assertion fails, this is a real integration bug (not caught by the mocked unit tests, since those don't exercise Foundry's actual validation of document-creation payloads) — debug against the live error message from `page.evaluate` before proceeding to commit.

- [ ] **Step 9: Commit**

```bash
git add packages/adapter-foundry/src/index.js packages/adapter-foundry/macros/gerar-masmorra.js packages/adapter-foundry/test/index.test.js
git commit -m "feat(adapter-foundry): module entry point, example macro, end-to-end verified against live Foundry v13"
```

(The dev symlink at `/home/FelipeAlves/foundry-local/data/Data/modules/dungeon-forge` is a local dev-environment convenience outside the repo — it is not part of this commit.)

---

## Final check

Run `npx vitest run` and `npm run lint` from the repo root once more after all 5 tasks — both must be clean before moving to whole-branch review. Also re-run Task 5 Step 8's full E2E generation one final time against the live Foundry to confirm the finished branch (not just the task-by-task incremental state) produces a correct, fully-wired dungeon.
