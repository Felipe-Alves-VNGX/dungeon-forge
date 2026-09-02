# Design — adapter-foundry: v13 target (N Scenes, paired teleport Regions)

## Context

`SPEC.md` §5.14 already specifies, in significant depth, what `adapter-foundry` must produce for Foundry v13: a JournalEntry ("key") created first, then one Scene per floor (each with walls/notes/lights and stair Regions), then a second pass wiring paired `teleportToken` RegionBehaviors between each `VerticalLink`'s two Regions — the whole operation transactional (roll back everything already created if a later step fails). Several details were marked `// TODO(schema) até confirmar contra golden sample` in that section.

This design resolves those TODOs against a **real, running Foundry v13.351 instance** (local, reachable via Playwright in this environment — confirmed working end-to-end: browser launches, connects, and can drive the actual game via `page.evaluate`), rather than against documentation or guesswork. Concrete schema facts below were read directly from `foundry.documents.Base*.schema.fields` and from round-tripping real documents through `createEmbeddedDocuments`/`.toObject()` in that instance.

This is the **first of two adapter-foundry targets** (v14 is a separate, later design/plan). It is also the first code in the repository that imports Foundry globals — `packages/core` remains at zero Foundry dependency, unchanged.

## Goals

- A GM can call one API function from a Foundry macro and get a fully-wired multi-floor dungeon: a key JournalEntry, N Scenes (one per floor) with real walls and door flags, Notes linking to key pages, and stair Regions that actually teleport a token between floors.
- The whole operation is transactional: any failure after the JournalEntry is created rolls back everything already created, in reverse order, so a failed run never leaves orphaned documents.
- Zero change to `packages/core`'s public surface or behavior — `adapter-foundry` only ever reads a `Dungeon` object and calls Foundry's document-creation API.

## Non-goals (this plan; explicit follow-ups)

- The v14 target (single Scene, elevation bands) — separate design/plan, after this one.
- Progressive-visibility shortcuts (reveal floor / reveal area under token / navigate selected tokens to a stair's destination Scene) — SPEC.md describes these as GM conveniences, not required for a dungeon to function; follow-up.
- Orphan-JournalEntry-flag recovery and the "revalidate escadas" command (detecting Scenes/Regions that reference a deleted key or a deleted destination Scene) — follow-up; requires the base creation flow to exist first.
- A configuration UI (dialog/form) for `generate()`'s input — this round exposes a plain async API function, invoked from a macro with a hand-written config object.
- Lights (`lights[]`, one per non-`'filler'`-role area) — SPEC.md marks these optional; deferred to keep this round's scope to the structurally-required documents (walls, notes, regions/behaviors). Follow-up.

## Confirmed Foundry v13 schema (read from the live instance, not guessed)

**`WallDocument`** fields (from `foundry.documents.BaseWall.schema.fields`): `c` (ArrayField — `[x1,y1,x2,y2]` in pixels), `light`/`move`/`sight`/`sound` (NumberField, `CONST.WALL_SENSE_TYPES`: `NONE:0, LIMITED:10, NORMAL:20, PROXIMITY:30, DISTANCE:40`), `dir` (`CONST.WALL_DIRECTIONS`: `BOTH:0, LEFT:1, RIGHT:2`), `door` (`CONST.WALL_DOOR_TYPES`: `NONE:0, DOOR:1, SECRET:2`), `ds` (`CONST.WALL_DOOR_STATES`: `CLOSED:0, OPEN:1, LOCKED:2`). A plain, non-door wall: `{c:[x1,y1,x2,y2], light:20, move:20, sight:20, sound:20, dir:0, door:0, ds:0}`. A door: same, plus `door: dungeon-forge Door.secret ? 2 : 1`.

**`RegionDocument`** fields: `name`, `shapes` (array of plain shape-data objects — confirmed real round-trip shape: `{type:'rectangle', x, y, width, height, hole:false, rotation:0}`, i.e. **pixel coordinates**, not grid cells — `x/y/width/height` must be multiplied by `gridSize` same as walls/notes), `elevation`, `behaviors` (embedded collection, populated via a second `createEmbeddedDocuments('RegionBehavior', ...)` call after the Region exists), `visibility`, `locked`.

**`RegionBehavior`** of `type: 'teleportToken'`: `system` schema is exactly `{destination: DocumentUUIDField, choice: BooleanField}`. Confirmed by creating one for real: `system.destination` is a **full document UUID string** (`"Scene.<sceneId>.Region.<regionId>"`, from `region.uuid`), not a bare id — this resolves SPEC.md's "aponta para a `regionId` da outra" into a concrete value. `choice: false` (no player-facing teleport confirmation dialog).

**`NoteDocument`** fields: `entryId`/`pageId` (`ForeignDocumentField`s — plain id strings), `x`/`y` (pixels), `texture` (`TextureData` — `{src: "path/to/icon.svg", ...}`), `iconSize`, `text`, `fontSize`, `textAnchor` (`CONST.TEXT_ANCHOR_POINTS`: `CENTER:0, BOTTOM:1, TOP:2, LEFT:3, RIGHT:4` — SPEC.md's "centro" is `0`), `global` (Boolean).

**`SceneDocument`**: `grid` is a `SchemaField` (object, not a bare number) — real shape is `{type, size, distance, units, color, alpha, thickness}`; `background` is `TextureData` (`{src, ...}`), not a bare path string.

## Module structure

New workspace `packages/adapter-foundry/`:

```
packages/adapter-foundry/
  module.json              # Foundry manifest: id "dungeon-forge", esmodules: ["src/index.js"], compatibility.verified: "13"
  package.json             # @dungeon-forge/adapter-foundry, depends on @dungeon-forge/core
  src/
    shared/
      key-journal.js        # createKeyJournal(dungeon, config) -> JournalEntry, page-per-Area + Legenda page
      icons.js               # ROLE_ICON map + iconForRole(role)
      geometry.js            # toPixel(cell, gridSize), buildWallData(wall, gridSize), buildNoteData(area, gridSize, pageId)
    v13.js                   # emitV13(dungeon, config) — orchestration + rollback (this plan's main deliverable)
    index.js                 # Hooks.once('init', ...) registers game.modules.get('dungeon-forge').api = { generate }
  macros/
    gerar-masmorra.js         # example macro calling api.generate(EXAMPLE_CONFIG) — imported into the module's compendium
  test/
    shared/                   # unit tests for pure builders (no Foundry needed)
    v13.test.js                # orchestration tests against minimal hand-written stubs of Scene/JournalEntry/Region
```

`shared/` holds only what SPEC.md §3.1 already scopes as shared: key-JournalEntry construction, icon-by-role, pixel conversion, Note-field construction. Wall-list/Region-list assembly per Scene, and the two-phase Region-behavior wiring, are v13-specific (`v13.js`) since v14 does this differently (single Scene, elevation-tagged placeables instead of per-floor Scenes).

## `index.js` — entry point

```js
Hooks.once('init', () => {
  game.modules.get('dungeon-forge').api = { generate };
});

async function generate(config) {
  if (config.target !== 'v13') throw new Error(`adapter-foundry: unsupported target "${config.target}" (only 'v13' implemented)`);
  const dungeon = generateDungeon(config); // from @dungeon-forge/core
  return emitV13(dungeon, config);
}
```

`generateDungeon`'s own errors (bad config, invariant failures) propagate unchanged — nothing has been created in Foundry yet at that point, so there is nothing to roll back.

## `emitV13` — transactional orchestration

```js
export async function emitV13(dungeon, config) {
  const journal = await createKeyJournal(dungeon, config);
  try {
    const pageIdByAreaId = mapAreaPagesById(journal, dungeon);
    const scenes = await createFloorScenes(dungeon, config, pageIdByAreaId);
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

`createFloorScenes` creates each floor's Scene with `walls`, `notes`, and `regions` (geometry only — a `RegionRectangleShape`-equivalent bbox per `VerticalLink` touching that floor) in one `Scene.create({...})` call per floor (walls/notes/regions as embedded-data arrays in the creation payload, not separate `createEmbeddedDocuments` calls — cheaper and still lets a mid-batch Foundry-side validation failure reject the whole Scene atomically). `wireStairRegionBehaviors` runs after **all** Scenes exist (a `VerticalLink`'s partner Region UUID needs the *other* floor's Scene id, which isn't known until that Scene is created) — for each `VerticalLink`, finds its two Regions (one per Scene, matched by a stored `flags['dungeon-forge'].linkId`) and calls `createEmbeddedDocuments('RegionBehavior', ...)` on each with `system.destination` set to the *other* Region's UUID.

A Region's `linkId` flag (`region.flags['dungeon-forge'].linkId = link.id`) is how `wireStairRegionBehaviors` finds the matching pair without guessing by position — set at Scene-creation time, read back after all Scenes exist.

## Wall/Note/Region geometry — reusing `packages/render`'s plan, not re-deriving it

`packages/render`'s `buildRenderPlan(dungeon, floor, gridSize)` (already used by `harness/src/floor-editor.js`) already computes `wallLines` (`{x1,y1,x2,y2,isDoor}`, in pixels) for a floor. `shared/geometry.js`'s `buildWallData` wraps each of those into the Foundry `WallDocument` shape above — no wall math is re-derived in `adapter-foundry`, only translated field-by-field. Room shape (rect/L/cross/circle/triangle/custom) is irrelevant here: `buildRenderPlan` already resolved it into flat wall segments upstream.

## Testing

- **Unit (mocked, no Foundry):** `shared/geometry.js`'s pure builders (`buildWallData`, `buildNoteData`) tested directly against known inputs/outputs — no Foundry classes involved, following the exact field names confirmed above. `v13.test.js` tests `emitV13`'s orchestration and rollback logic against hand-written stub classes (`{create: vi.fn(...), delete: vi.fn(...)}`) that only record calls — verifies rollback order (Region-wiring failure deletes Scenes not the Journal only if Scene-creation itself didn't already fail one level up) without touching a real Foundry.
- **E2E (real, driven via Playwright against the local Foundry instance confirmed working in this session):** after each task that changes `emitV13`'s observable behavior, load the symlinked module into the running world, invoke `game.modules.get('dungeon-forge').api.generate(TEST_CONFIG)` via `page.evaluate`, and assert on the real resulting `game.scenes`/`game.journal` state (Scene count, wall count matches `dungeon.walls.length`, Region behavior's `system.destination` resolves to a real Region, etc.) — then delete the created documents to leave the test world clean for the next run.

## Dev deployment

Symlink `packages/adapter-foundry` → `/home/FelipeAlves/foundry-local/data/Data/modules/dungeon-forge` (matching `module.json`'s `id`). Foundry needs a world reload (not a full server restart) to pick up source changes — done via Playwright (`page.reload()` or re-navigating to `/game`) between verification steps, not a manual step.

## Error handling

- `generate()` throws immediately, unchanged, for `config.target !== 'v13'` or any `generateDungeon` validation failure — nothing created yet.
- Every rollback (`journal.delete()`, `scenes.map(s => s.delete())`) is best-effort — if a rollback delete itself throws (e.g. permissions), the original error is still what propagates to the caller (the rollback failure is logged via `console.error`, not swallowed silently, but doesn't mask the real failure with a rollback-specific one).
