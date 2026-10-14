# adapter-foundry Room Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the GM hand-adjust a room's shape (type, parameter, size, or full custom cell-by-cell mode) from `DungeonForgePreviewApp`'s "Editar salas" button, reusing the exact shape-editing logic already built for the dev harness — replacing the "not implemented" stub currently in `preview-app.js`.

**Architecture:** Three layers, from purest to most Foundry-coupled. (1) `packages/room-shape-ui` gains 4 new pure mutation functions (`applyShapeType`, `applyShapeParam`, `applySizeDelta`, `applyCustomToggle`) — direct ports of logic that already exists, DOM-free, inside `harness/src/room-manager.js`, extracted so both `harness` and this new Foundry-native editor share one implementation (same rationale as Sub-project A's original extraction). (2) `packages/adapter-foundry/src/shared/room-editor-context.js` — new adapter-foundry-local pure helpers that shape the room list and detail-panel data these mutation functions and `room-shape-ui`'s existing read-only helpers (`SHAPE_TYPES`, `smallRoomWarningApplies`, `isDisconnected`) produce, into exactly what the Handlebars templates need. (3) `DungeonForgeRoomEditorApp` — the `ApplicationV2` class itself, thin: `_prepareContext` calls straight into layer 2, action handlers call straight into layer 1, `_onRender` wires the shape-editor SVG's click-to-toggle (custom mode) and the two `<select>` elements' `change` listeners, following the exact race-guard/listener-dedup conventions already established and reviewed in `preview-app.js`. `harness/src/room-manager.js` itself is NOT touched by this plan — it keeps its own local copies of the 4 mutation functions; migrating it onto the shared package is an available follow-up, not required for this feature to work, and out of scope here (YAGNI: this plan's only consumer of the new package functions is the new Foundry app).

**Tech Stack:** Vanilla JS ES modules, Foundry VTT v13 `ApplicationV2`/`HandlebarsApplicationMixin`, Handlebars templates, Vitest, npm workspaces, esbuild (existing bundler for `packages/adapter-foundry`).

**Spec:** `docs/superpowers/specs/2026-09-03-adapter-foundry-room-editor-design.md`

## Global Constraints

- `Math.random` is banned repo-wide — not applicable, no randomness anywhere in this plan.
- Zero behavior change to `harness/src/room-manager.js` — this plan reads it as a reference for what to port, but does not modify it.
- Every file that accesses `foundry.applications.api` at module-evaluation time (not inside a function/method body) must stay importable in plain Node once the test stub (`test/helpers/foundry-stub.js`, from Sub-project B) is installed first — same convention `preview-app.js`/`config-app.js` already established.
- A file that references another `ApplicationV2` class only inside a method body (not needed at module-evaluation time) uses a dynamic `await import(...)` there, matching the existing `#onBack`/`Hooks.once` convention in this package — avoids any risk of accidental circular-import ordering issues.
- All new pure logic (no Foundry globals: no `foundry`, `game`, `ui`, `Hooks`, no DOM APIs like `document`/`window`) lives in `packages/room-shape-ui/src/` or `packages/adapter-foundry/src/shared/`, matching the established split.
- `window.confirm(...)` for the "discard custom edits?" prompt when switching away from custom shape mode — this matches `harness/src/room-manager.js:170`'s existing, working pattern exactly (not a new API surface to guess at; Foundry's client runs in a real browser, so `window.confirm` is available). Do not use `foundry.applications.api.DialogV2` or similar — its exact v13 signature was not verified live in this session and using an unverified API here would repeat the mistake Sub-project B's final review caught (an assumption about Foundry internals that turned out to need fixing).
- Portuguese-language GM-facing strings — matches every other user-facing string already shipped in this package.

---

### Task 1: `packages/room-shape-ui` — pure room-shape mutation helpers

**Files:**
- Modify: `packages/room-shape-ui/src/shape-editor.js`
- Modify: `packages/room-shape-ui/test/shape-editor.test.js`

**Interfaces:**
- Consumes: this file's own existing exports (`SHAPE_TYPES`, `defaultParamsFor`, `smallRoomWarningApplies`, `cellsFromRoom`, `toggleCustomCell`) — no new imports needed, everything these 4 new functions need is already in this file.
- Produces: `applyShapeType(room, type)`, `applyShapeParam(room, value)`, `applySizeDelta(room, dungeon, dim, delta)`, `applyCustomToggle(room, x, y)` — all mutate `room` in place, return nothing. Consumed by Task 3's `DungeonForgeRoomEditorApp`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/room-shape-ui/test/shape-editor.test.js` (the existing tests in this file stay unchanged above this):

```js

describe('applyShapeType', () => {
  it('sets a non-custom type, falling back to rect when the room is too small for it', () => {
    const room = { x: 0, y: 0, w: 3, h: 3, shape: { type: 'rect', params: {} } };
    applyShapeType(room, 'l'); // 'l' needs w,h >= 4; room is 3x3
    expect(room.shape.type).toBe('rect');
  });

  it('sets a non-custom type with its default params when the room is big enough', () => {
    const room = { x: 0, y: 0, w: 6, h: 6, shape: { type: 'rect', params: {} } };
    applyShapeType(room, 'l');
    expect(room.shape).toEqual({ type: 'l', params: { corner: 'nw' } });
  });

  it('switching to custom captures the room\'s current rasterized cells', () => {
    const room = { x: 2, y: 3, w: 2, h: 2, shape: { type: 'rect', params: {} } };
    applyShapeType(room, 'custom');
    expect(room.shape.type).toBe('custom');
    expect(room.shape.params.cells).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });
});

describe('applyShapeParam', () => {
  it('replaces the param object for the current shape type', () => {
    const room = { shape: { type: 'l', params: { corner: 'nw' } } };
    applyShapeParam(room, 'se');
    expect(room.shape).toEqual({ type: 'l', params: { corner: 'se' } });
  });

  it('does nothing if the current shape type has no param', () => {
    const room = { shape: { type: 'rect', params: {} } };
    applyShapeParam(room, 'anything');
    expect(room.shape).toEqual({ type: 'rect', params: {} });
  });
});

describe('applySizeDelta', () => {
  it('grows w within the dungeon bounds and recenters cx', () => {
    const room = { x: 0, y: 0, w: 6, h: 6, cx: 3, cy: 3, shape: { type: 'rect', params: {} } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', 1);
    expect(room.w).toBe(7);
    expect(room.cx).toBe(3.5);
  });

  it('clamps growth at the dungeon edge', () => {
    const room = { x: 18, y: 0, w: 2, h: 2, cx: 19, cy: 1, shape: { type: 'rect', params: {} } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', 5);
    expect(room.w).toBe(2); // 20 - x(18) = max 2, already at max
  });

  it('never shrinks below 1', () => {
    const room = { x: 0, y: 0, w: 1, h: 1, cx: 0.5, cy: 0.5, shape: { type: 'rect', params: {} } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', -5);
    expect(room.w).toBe(1);
  });

  it('reverts a too-small non-rect shape back to rect', () => {
    const room = { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, shape: { type: 'l', params: { corner: 'nw' } } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', -1); // now 3x4, too small for 'l'
    expect(room.shape).toEqual({ type: 'rect', params: {} });
  });

  it('is a no-op in custom mode', () => {
    const room = { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, shape: { type: 'custom', params: { cells: [[0, 0]] } } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', 1);
    expect(room.w).toBe(4);
  });
});

describe('applyCustomToggle', () => {
  it('adds a cell and re-anchors the bounding box when it extends beyond the current origin', () => {
    const room = { x: 5, y: 5, w: 1, h: 1, cx: 5.5, cy: 5.5, shape: { type: 'custom', params: { cells: [[0, 0]] } } };
    applyCustomToggle(room, 4, 5); // one cell to the left of the origin
    expect(room.x).toBe(4);
    expect(room.w).toBe(2);
    expect(room.shape.params.cells).toEqual(expect.arrayContaining([[0, 0], [1, 0]]));
  });

  it('removes a cell without re-adding it if it was the last one (toggleCustomCell keeps at least one)', () => {
    const room = { x: 5, y: 5, w: 1, h: 1, cx: 5.5, cy: 5.5, shape: { type: 'custom', params: { cells: [[0, 0]] } } };
    applyCustomToggle(room, 5, 5); // toggling the only existing cell
    expect(room.shape.params.cells).toEqual([[0, 0]]);
  });
});
```

Also add these 4 names to this test file's existing top import line (find the current `import { ... } from '../src/shape-editor.js';` line and add `applyShapeType, applyShapeParam, applySizeDelta, applyCustomToggle` to the destructured list — read the file first to get the exact current list, since it has grown since this plan was written).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/room-shape-ui`
Expected: FAIL — the 4 new functions aren't exported yet.

- [ ] **Step 3: Implement the 4 functions**

Append to `packages/room-shape-ui/src/shape-editor.js` (after the existing `wireShapeEditorToggle` function, at the end of the file):

```js

export function applyShapeType(room, type) {
  if (type === 'custom') {
    room.shape = { type: 'custom', params: { cells: cellsFromRoom(room) } };
    return;
  }
  const effective = smallRoomWarningApplies(type, room.w, room.h) ? 'rect' : type;
  room.shape = { type: effective, params: defaultParamsFor(effective) };
}

export function applyShapeParam(room, value) {
  if (!room.shape) return;
  const def = SHAPE_TYPES.find((s) => s.type === room.shape.type);
  if (!def?.param) return;
  room.shape = { type: room.shape.type, params: { [def.param.key]: value } };
}

export function applySizeDelta(room, dungeon, dim, delta) {
  if (room.shape?.type === 'custom') return;
  const max = dim === 'w' ? dungeon.width - room.x : dungeon.height - room.y;
  const next = Math.max(1, Math.min(max, room[dim] + delta));
  if (next === room[dim]) return;
  room[dim] = next;
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
  const currentType = room.shape?.type ?? 'rect';
  if (smallRoomWarningApplies(currentType, room.w, room.h)) {
    room.shape = { type: 'rect', params: {} };
  }
}

export function applyCustomToggle(room, x, y) {
  room.shape.params.cells = toggleCustomCell(room.shape.params.cells, room, x, y);
  const bounds = room.shape.params.cells.reduce(
    (acc, [dx, dy]) => ({
      minX: Math.min(acc.minX, dx), minY: Math.min(acc.minY, dy),
      maxX: Math.max(acc.maxX, dx), maxY: Math.max(acc.maxY, dy),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  room.x += bounds.minX;
  room.y += bounds.minY;
  room.w = bounds.maxX - bounds.minX + 1;
  room.h = bounds.maxY - bounds.minY + 1;
  room.shape.params.cells = room.shape.params.cells.map(([dx, dy]) => [dx - bounds.minX, dy - bounds.minY]);
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
}
```

These are byte-faithful ports of the mutation logic already in `harness/src/room-manager.js`'s `applyShapeType`/`applyShapeParam`/`applySizeDelta`/`applyCustomToggle` — only the DOM calls (`el(...)`, `afterShapeChange()` re-render, `window.confirm`) are removed, since those are the caller's responsibility, not this pure package's.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/room-shape-ui`
Expected: PASS, all tests (existing + 11 new).

- [ ] **Step 5: Run the full workspace suite to confirm zero regression**

Run: `npx vitest run`
Expected: all tests pass — `harness`'s own tests are unaffected (this task doesn't touch `harness/`).

- [ ] **Step 6: Commit**

```bash
git add packages/room-shape-ui/src/shape-editor.js packages/room-shape-ui/test/shape-editor.test.js
git commit -m "feat(room-shape-ui): add pure room-shape mutation helpers for the Foundry room editor"
```

---

### Task 2: `packages/adapter-foundry/src/shared/room-editor-context.js` — pure context-shaping helpers

**Files:**
- Create: `packages/adapter-foundry/src/shared/room-editor-context.js`
- Create: `packages/adapter-foundry/test/shared/room-editor-context.test.js`

**Interfaces:**
- Consumes: `SHAPE_TYPES`, `smallRoomWarningApplies`, `isDisconnected` from `@dungeon-forge/room-shape-ui` (already a dependency of `packages/adapter-foundry` — no `package.json` change needed, confirm this by reading `packages/adapter-foundry/package.json` first; if `@dungeon-forge/room-shape-ui` is not yet listed there, add it as `"*"` alongside the existing `@dungeon-forge/core` entry and run `npm install`).
- Produces: `groupRoomsByFloor(rooms, areas, selectedRoomId)`, `buildWarningText(room, type)`, `buildDetailContext(room)` — consumed by Task 3's `DungeonForgeRoomEditorApp._prepareContext`.

- [ ] **Step 1: Confirm the dependency, adding it if missing**

Read `packages/adapter-foundry/package.json`. If `"@dungeon-forge/room-shape-ui"` is not already in `dependencies`, add `"@dungeon-forge/room-shape-ui": "*"` next to `"@dungeon-forge/core"`, then run `npm install` from the repo root.

- [ ] **Step 2: Write the failing tests**

```js
// packages/adapter-foundry/test/shared/room-editor-context.test.js
import { describe, it, expect } from 'vitest';
import { groupRoomsByFloor, buildWarningText, buildDetailContext } from '../../src/shared/room-editor-context.js';

describe('groupRoomsByFloor', () => {
  it('groups rooms by floor (1-indexed for display), sorted, marking the selected room active', () => {
    const rooms = [
      { id: 0, floor: 1 }, { id: 1, floor: 0 }, { id: 2, floor: 0 },
    ];
    const areas = [
      { roomId: 0, label: '2-01' }, { roomId: 1, label: '1-01' }, { roomId: 2, label: '1-02' },
    ];
    const result = groupRoomsByFloor(rooms, areas, 2);
    expect(result).toEqual([
      { floor: 1, rooms: [
        { id: 1, label: '1-01', active: false },
        { id: 2, label: '1-02', active: true },
      ] },
      { floor: 2, rooms: [
        { id: 0, label: '2-01', active: false },
      ] },
    ]);
  });

  it('falls back to the room id as the label when no matching area exists', () => {
    const rooms = [{ id: 5, floor: 0 }];
    const result = groupRoomsByFloor(rooms, [], null);
    expect(result[0].rooms[0].label).toBe('5');
  });
});

describe('buildWarningText', () => {
  it('warns about disconnected cells in custom mode', () => {
    const room = { w: 4, h: 4, shape: { type: 'custom', params: { cells: [[0, 0], [5, 5]] } } };
    expect(buildWarningText(room, 'custom')).toMatch(/desconectadas/);
  });

  it('warns about too-small non-rect shapes', () => {
    const room = { w: 3, h: 3, shape: { type: 'l', params: {} } };
    expect(buildWarningText(room, 'l')).toMatch(/vira retângulo/);
  });

  it('returns null when there is nothing to warn about', () => {
    const room = { w: 6, h: 6, shape: { type: 'rect', params: {} } };
    expect(buildWarningText(room, 'rect')).toBeNull();
  });
});

describe('buildDetailContext', () => {
  it('returns null for no selected room', () => {
    expect(buildDetailContext(null)).toBeNull();
  });

  it('builds the full detail context for a rect room, with shapeTypes carrying a selected flag', () => {
    const room = { id: 1, w: 6, h: 6, shape: { type: 'rect', params: {} } };
    const context = buildDetailContext(room);
    expect(context.roomId).toBe(1);
    expect(context.selectedType).toBe('rect');
    expect(context.hasParam).toBe(false);
    expect(context.sizeSteppersDisabled).toBe(false);
    expect(context.warning).toBeNull();
    const rectEntry = context.shapeTypes.find((s) => s.type === 'rect');
    expect(rectEntry.selected).toBe(true);
    const lEntry = context.shapeTypes.find((s) => s.type === 'l');
    expect(lEntry.selected).toBe(false);
  });

  it('builds param options with a selected flag for a shape that has a param', () => {
    const room = { id: 2, w: 6, h: 6, shape: { type: 'l', params: { corner: 'se' } } };
    const context = buildDetailContext(room);
    expect(context.hasParam).toBe(true);
    expect(context.paramLabel).toBe('Canto');
    const seOption = context.paramOptions.find((o) => o.value === 'se');
    expect(seOption.selected).toBe(true);
    const nwOption = context.paramOptions.find((o) => o.value === 'nw');
    expect(nwOption.selected).toBe(false);
  });

  it('disables size steppers and includes no param options in custom mode', () => {
    const room = { id: 3, w: 4, h: 4, shape: { type: 'custom', params: { cells: [[0, 0]] } } };
    const context = buildDetailContext(room);
    expect(context.sizeSteppersDisabled).toBe(true);
    expect(context.hasParam).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/shared/room-editor-context.test.js`
Expected: FAIL — `../../src/shared/room-editor-context.js` does not exist yet.

- [ ] **Step 4: Implement `src/shared/room-editor-context.js`**

```js
// packages/adapter-foundry/src/shared/room-editor-context.js
//
// Pure data-shaping for DungeonForgeRoomEditorApp's _prepareContext — no
// Foundry globals used here, same convention as ./geometry.js, ./icons.js,
// ./key-journal.js, ./config-form.js.
import { SHAPE_TYPES, smallRoomWarningApplies, isDisconnected } from '@dungeon-forge/room-shape-ui';

export function groupRoomsByFloor(rooms, areas, selectedRoomId) {
  const areaByRoomId = new Map(areas.map((a) => [a.roomId, a]));
  const byFloor = new Map();
  for (const room of rooms) {
    if (!byFloor.has(room.floor)) byFloor.set(room.floor, []);
    byFloor.get(room.floor).push(room);
  }
  return [...byFloor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floor, floorRooms]) => ({
      floor: floor + 1,
      rooms: floorRooms.map((room) => ({
        id: room.id,
        label: areaByRoomId.get(room.id)?.label ?? String(room.id),
        active: room.id === selectedRoomId,
      })),
    }));
}

export function buildWarningText(room, type) {
  if (type === 'custom' && isDisconnected(room.shape.params.cells)) {
    return 'Células desconectadas — pode gerar um corredor estranho até aqui.';
  }
  if (smallRoomWarningApplies(type, room.w, room.h)) {
    return `Formas L/cruz/círculo/triângulo exigem lado >= 4; esta sala (${room.w}x${room.h}) vira retângulo.`;
  }
  return null;
}

export function buildDetailContext(room) {
  if (!room) return null;
  const type = room.shape?.type ?? 'rect';
  const def = SHAPE_TYPES.find((s) => s.type === type);
  const selectedParam = room.shape?.params?.[def?.param?.key] ?? '';
  return {
    roomId: room.id,
    shapeTypes: SHAPE_TYPES.map((s) => ({ ...s, selected: s.type === type })),
    selectedType: type,
    hasParam: !!def?.param,
    paramLabel: def?.param?.label ?? '',
    paramOptions: (def?.param?.options ?? []).map((o) => ({ ...o, selected: o.value === selectedParam })),
    w: room.w,
    h: room.h,
    sizeSteppersDisabled: type === 'custom',
    warning: buildWarningText(room, type),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/shared/room-editor-context.test.js`
Expected: PASS, all 8 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-foundry/package.json packages/adapter-foundry/src/shared/room-editor-context.js packages/adapter-foundry/test/shared/room-editor-context.test.js package-lock.json
git commit -m "feat(adapter-foundry): add pure room-editor context-shaping helpers"
```
(Omit `packages/adapter-foundry/package.json`/`package-lock.json` from `git add` if Step 1 found the dependency already present and made no change.)

---

### Task 3: `DungeonForgeRoomEditorApp`

**Files:**
- Create: `packages/adapter-foundry/src/room-editor-app.js`
- Create: `packages/adapter-foundry/templates/room-editor-list.hbs`
- Create: `packages/adapter-foundry/templates/room-editor-detail.hbs`
- Create: `packages/adapter-foundry/styles/room-editor.css`
- Modify: `packages/adapter-foundry/module.json`
- Create: `packages/adapter-foundry/test/room-editor-app.test.js`

**Interfaces:**
- Consumes: `groupRoomsByFloor`, `buildDetailContext` from `./shared/room-editor-context.js` (Task 2); `applyShapeType`, `applyShapeParam`, `applySizeDelta`, `applyCustomToggle`, `buildShapeEditorSVG`, `wireShapeEditorToggle` from `@dungeon-forge/room-shape-ui` (Task 1 + pre-existing); `installFoundryStub`/`uninstallFoundryStub` from `./test/helpers/foundry-stub.js` (already exists from Sub-project B).
- Produces: `DungeonForgeRoomEditorApp` (class, constructor `{ dungeon, onClose, ...options }`) — consumed by Task 4's `preview-app.js`.

- [ ] **Step 1: Write the failing tests**

```js
// packages/adapter-foundry/test/room-editor-app.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/adapter-foundry/test/room-editor-app.test.js`
Expected: FAIL — `../src/room-editor-app.js` does not exist yet.

- [ ] **Step 3: Implement `src/room-editor-app.js`**

```js
// packages/adapter-foundry/src/room-editor-app.js
//
// Foundry-native re-wiring of the shape-editor logic already built for the
// harness — see docs/superpowers/specs/2026-09-03-adapter-foundry-room-editor-design.md.
// Every actual computation (SHAPE_TYPES, applyShapeType/Param/SizeDelta,
// applyCustomToggle, buildShapeEditorSVG, wireShapeEditorToggle) comes from
// @dungeon-forge/room-shape-ui — this class is only Foundry glue.
import { applyShapeType, applyShapeParam, applySizeDelta, applyCustomToggle, buildShapeEditorSVG, wireShapeEditorToggle } from '@dungeon-forge/room-shape-ui';
import { groupRoomsByFloor, buildDetailContext } from './shared/room-editor-context.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const ROOM_EDITOR_GRID_SIZE = 24;

export class DungeonForgeRoomEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'dungeon-forge-room-editor',
    window: { title: 'Editar Salas', resizable: true },
    position: { width: 640, height: 520 },
    actions: {
      selectRoom: DungeonForgeRoomEditorApp.#onSelectRoom,
      resizeW: DungeonForgeRoomEditorApp.#onResizeW,
      resizeH: DungeonForgeRoomEditorApp.#onResizeH,
    },
  };

  static PARTS = {
    roomList: { template: 'modules/dungeon-forge/templates/room-editor-list.hbs' },
    detail: { template: 'modules/dungeon-forge/templates/room-editor-detail.hbs' },
  };

  constructor({ dungeon, onClose, ...options }) {
    super(options);
    this.dungeon = dungeon;
    this.onClose = onClose;
    this.selectedRoomId = dungeon.rooms[0]?.id ?? null;
  }

  #selectedRoom() {
    return this.dungeon.rooms.find((r) => r.id === this.selectedRoomId) ?? null;
  }

  async _prepareContext() {
    return {
      roomsByFloor: groupRoomsByFloor(this.dungeon.rooms, this.dungeon.areas, this.selectedRoomId),
      detail: buildDetailContext(this.#selectedRoom()),
    };
  }

  async _onRender() {
    const room = this.#selectedRoom();
    if (!room) return;

    const typeSelect = this.element.querySelector('[data-shape-type-select]');
    if (typeSelect && !typeSelect.dataset.listenerBound) {
      typeSelect.dataset.listenerBound = 'true';
      typeSelect.addEventListener('change', async (event) => {
        await this.#applyShapeTypeChange(room, event.target.value);
      });
    }

    const paramSelect = this.element.querySelector('[data-shape-param-select]');
    if (paramSelect && !paramSelect.dataset.listenerBound) {
      paramSelect.dataset.listenerBound = 'true';
      paramSelect.addEventListener('change', async (event) => {
        applyShapeParam(room, event.target.value);
        await this.render();
      });
    }

    const interactive = (room.shape?.type ?? 'rect') === 'custom';
    const container = this.element.querySelector('[data-shape-editor]');
    if (container) {
      container.innerHTML = buildShapeEditorSVG(room, this.dungeon, ROOM_EDITOR_GRID_SIZE, interactive);
      if (interactive) {
        wireShapeEditorToggle(container, (x, y) => {
          applyCustomToggle(room, x, y);
          this.render();
        });
      }
    }
  }

  async #applyShapeTypeChange(room, nextType) {
    if (room.shape?.type === 'custom' && nextType !== 'custom') {
      if (!window.confirm('Isso descarta os ajustes manuais desta sala. Continuar?')) {
        await this.render();
        return;
      }
    }
    applyShapeType(room, nextType);
    await this.render();
  }

  async close(options) {
    this.onClose?.();
    return super.close(options);
  }

  static async #onSelectRoom(event, target) {
    this.selectedRoomId = Number(target.dataset.roomId);
    await this.render();
  }

  static async #onResizeW(event, target) {
    const room = this.dungeon.rooms.find((r) => r.id === this.selectedRoomId);
    if (!room) return;
    applySizeDelta(room, this.dungeon, 'w', Number(target.dataset.delta));
    await this.render();
  }

  static async #onResizeH(event, target) {
    const room = this.dungeon.rooms.find((r) => r.id === this.selectedRoomId);
    if (!room) return;
    applySizeDelta(room, this.dungeon, 'h', Number(target.dataset.delta));
    await this.render();
  }
}
```

- [ ] **Step 4: Create `templates/room-editor-list.hbs`**

```handlebars
<div class="room-editor-list">
  {{#each roomsByFloor}}
    <h3>Andar {{this.floor}}</h3>
    <ul class="room-items">
      {{#each this.rooms}}
        <li class="room-item{{#if this.active}} active{{/if}}" data-action="selectRoom" data-room-id="{{this.id}}">
          <span class="room-label">{{this.label}}</span>
        </li>
      {{/each}}
    </ul>
  {{/each}}
</div>
```

- [ ] **Step 5: Create `templates/room-editor-detail.hbs`**

```handlebars
<div class="room-editor-detail">
  {{#if detail}}
    <div id="shape-editor-controls">
      <label>Tipo
        <select data-shape-type-select>
          {{#each detail.shapeTypes}}
            <option value="{{this.type}}" {{#if this.selected}}selected{{/if}}>{{this.label}}</option>
          {{/each}}
        </select>
      </label>
      {{#if detail.hasParam}}
        <label>
          <span>{{detail.paramLabel}}</span>
          <select data-shape-param-select>
            {{#each detail.paramOptions}}
              <option value="{{this.value}}" {{#if this.selected}}selected{{/if}}>{{this.label}}</option>
            {{/each}}
          </select>
        </label>
      {{/if}}
      <div class="shape-size-row">
        <span>Largura</span>
        <button type="button" data-action="resizeW" data-delta="-1" {{#if detail.sizeSteppersDisabled}}disabled{{/if}}>-</button>
        <span>{{detail.w}}</span>
        <button type="button" data-action="resizeW" data-delta="1" {{#if detail.sizeSteppersDisabled}}disabled{{/if}}>+</button>
      </div>
      <div class="shape-size-row">
        <span>Altura</span>
        <button type="button" data-action="resizeH" data-delta="-1" {{#if detail.sizeSteppersDisabled}}disabled{{/if}}>-</button>
        <span>{{detail.h}}</span>
        <button type="button" data-action="resizeH" data-delta="1" {{#if detail.sizeSteppersDisabled}}disabled{{/if}}>+</button>
      </div>
    </div>
    {{#if detail.warning}}
      <p class="shape-warning">{{detail.warning}}</p>
    {{/if}}
    <div data-shape-editor></div>
  {{else}}
    <p class="empty">Selecione uma sala.</p>
  {{/if}}
</div>
```

- [ ] **Step 6: Create `styles/room-editor.css`**

```css
/* packages/adapter-foundry/styles/room-editor.css
 *
 * Ported from harness/index.html's shape-editor styling — this CSS was
 * deliberately NOT extracted alongside the JS in Sub-project A (only pure
 * logic went into packages/room-shape-ui), so it's duplicated here rather
 * than shared, matching what the Sub-project A final review flagged and
 * scoped as a follow-up, not a blocker. */
#shape-editor-controls { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
.shape-size-row { display: flex; align-items: center; gap: 0.4rem; }
.shape-size-row button { width: 1.6rem; height: 1.6rem; cursor: pointer; }
.shape-warning { font-size: 0.78rem; color: #a08050; max-width: 32rem; }
.shape-editor-svg { display: block; max-width: 100%; height: auto; }
.shape-editor-bg { fill: #1e1e1e; stroke: #333; stroke-width: 1; }
.shape-cell-on { fill: #2a3a2a; stroke: #35483a; stroke-width: 1; }
.shape-cell { fill: #1e1e1e; stroke: #333; stroke-width: 1; cursor: pointer; }
.shape-cell:hover { fill: #2a2a2a; }
.shape-cell.shape-cell-on { fill: #2a3a2a; stroke: #35483a; }
.shape-cell.shape-cell-on:hover { fill: #35483a; }
.room-editor-list .room-item { cursor: pointer; padding: 0.15rem 0.3rem; }
.room-editor-list .room-item.active { background: #2a3a2a; }
```

- [ ] **Step 7: Register the stylesheet in `module.json`**

Read `packages/adapter-foundry/module.json` first (its exact current fields may have grown). Add a `"styles"` array — if it doesn't exist yet, add it as a new top-level key (position doesn't matter, but keep it near `"esmodules"` for readability):

```json
"styles": ["styles/room-editor.css"],
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run packages/adapter-foundry/test/room-editor-app.test.js`
Expected: PASS, all 3 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/adapter-foundry/src/room-editor-app.js packages/adapter-foundry/templates/room-editor-list.hbs packages/adapter-foundry/templates/room-editor-detail.hbs packages/adapter-foundry/styles/room-editor.css packages/adapter-foundry/module.json packages/adapter-foundry/test/room-editor-app.test.js
git commit -m "feat(adapter-foundry): add DungeonForgeRoomEditorApp"
```

---

### Task 4: Wire "Editar salas", rebuild, final verification

**Files:**
- Modify: `packages/adapter-foundry/src/preview-app.js`
- Modify: `packages/adapter-foundry/dist/index.js` (rebuilt, not hand-edited)

**Interfaces:**
- Consumes: `DungeonForgeRoomEditorApp` from `./room-editor-app.js` (Task 3) — imported **dynamically** inside `#onEditRooms`, matching this file's existing `#onBack` convention (dynamic import of another `ApplicationV2` class referenced only inside a method body).

- [ ] **Step 1: Replace the `#onEditRooms` stub**

In `packages/adapter-foundry/src/preview-app.js`, replace:

```js
  static async #onEditRooms() {
    // Sub-project C (separate plan, not yet implemented) replaces this
    // with DungeonForgeRoomEditorApp — see
    // docs/superpowers/specs/2026-09-03-adapter-foundry-room-editor-design.md.
    ui.notifications.warn('Editor de salas ainda não implementado.');
  }
```

with:

```js
  static async #onEditRooms() {
    const { DungeonForgeRoomEditorApp } = await import('./room-editor-app.js');
    new DungeonForgeRoomEditorApp({
      dungeon: this.dungeon,
      onClose: () => this.render(),
    }).render(true);
  }
```

(`this.dungeon` is the same object reference `DungeonForgeRoomEditorApp`'s action handlers mutate directly — per the spec, no explicit data-passing back is needed; closing the room editor and re-rendering the preview picks up the mutations for free, since both apps hold the same `Dungeon` object.)

- [ ] **Step 2: Run the full package test suite**

Run: `npx vitest run packages/adapter-foundry`
Expected: PASS — all pre-existing tests plus Tasks 1-3's new ones.

- [ ] **Step 3: Full workspace regression check**

Run: `npx vitest run` and `npm run lint` from the repo root.
Expected: both clean.

- [ ] **Step 4: Rebuild and commit the published bundle**

The committed `packages/adapter-foundry/dist/index.js` must be rebuilt any time `src/` changes — this was the Critical finding from Sub-project B's final review, and it applies again here:

```bash
npm run build --workspace=@dungeon-forge/adapter-foundry
grep -c "DungeonForgeRoomEditorApp" packages/adapter-foundry/dist/index.js
```
Expected: the grep count is > 0, confirming the rebuilt bundle actually contains this plan's new code.

- [ ] **Step 5: Manual smoke check against a live local Foundry**

Same caveat as Sub-project B's Task 4: this app's rendering/interaction (room list clicks, shape-type/param dropdowns, size steppers, the custom-cell-click SVG, the `window.confirm` discard prompt) is not exercised by the automated suite — only `_prepareContext`/`close()`'s pure logic is (Task 3). If a live local Foundry v13 install is available:

1. Generate a dungeon via the config form, open the preview, click "Editar salas".
2. Confirm the room list renders grouped by floor, and clicking a room updates the detail panel.
3. Change the shape type dropdown to a non-rect type on a big-enough room — confirm the SVG preview updates and, if the type has a param (L or triangle), the param dropdown appears.
4. Switch to "Começar do zero (custom)" — confirm the SVG becomes clickable (`.shape-cell` cursor) and clicking cells toggles them, keeping at least one.
5. Switch a room with custom edits back to a non-custom type — confirm the `window.confirm` prompt appears, and canceling it leaves the room in custom mode.
6. Use the width/height +/- steppers — confirm they're disabled in custom mode, and elsewhere respect the dungeon's edge (can't grow past `dungeon.width`/`height`).
7. Close the room editor — confirm the preview image behind it re-renders reflecting the edited shape.

If no live browser/Foundry install is available in this execution environment, skip this step but say so explicitly in the task report — do not claim it as verified. At minimum, run `grep -rn "foundry\.applications\.api" packages/adapter-foundry/src/` and confirm exactly `config-app.js`, `preview-app.js`, and `room-editor-app.js` reference it, each once, at their own top level.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-foundry/src/preview-app.js packages/adapter-foundry/dist/index.js
git commit -m "feat(adapter-foundry): wire the room editor into the preview screen's Editar salas button"
```

---

## Final check

Run `npx vitest run` and `npm run lint` from the repo root once more after all four tasks — both must be clean before moving to whole-branch review.
