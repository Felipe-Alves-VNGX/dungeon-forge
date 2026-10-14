# Design — adapter-foundry: room editor (Sub-project C)

## Context

Sub-project B's preview screen (`DungeonForgePreviewApp`) has an "Editar
salas" button that should let the GM hand-adjust individual rooms of the
in-memory `Dungeon` before committing to Foundry — reusing the exact macro
shape picker + custom cell-editor already built for the harness, extracted
in Sub-project A into `@dungeon-forge/room-shape-ui`. This spec is the
Foundry-native re-wiring of that logic: same pure functions, new
`ApplicationV2` template instead of the harness's `index.html`.

**Depends on:** Sub-project A (`packages/room-shape-ui` must exist) and
Sub-project B (`DungeonForgePreviewApp` must exist to launch this from).

## Goals

- The GM can pick a room from the generated dungeon, change its shape
  type/parameter/size (or enter custom cell-by-cell mode), and see the
  change reflected in the in-memory `Dungeon` — identical underlying
  behavior to the harness's room manager, verified by reusing the same
  `@dungeon-forge/room-shape-ui` functions rather than re-implementing them.
- Closing the editor returns to the preview screen, which re-renders to
  show the edited layout.

## Non-goals

- Moving rooms (drag-to-reposition, like the harness's floor editor) — this
  spec covers shape editing only, matching what `room-shape-ui` actually
  exports. Position editing could be a later follow-up mirroring the
  harness's separate `floor-editor.js`, not in scope here.
- Editing anything other than `room.shape`/`w`/`h` — annotations, roles,
  etc. stay out of scope, same as the harness's own room manager never
  exposed those as editable.

## `DungeonForgeRoomEditorApp`

`ApplicationV2` + `HandlebarsApplicationMixin`, two `PARTS`: a room list
(grouped by floor, same grouping `harness/src/room-manager.js`'s
`renderRoomList` already does) and a detail panel for the selected room.

```js
class DungeonForgeRoomEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'dungeon-forge-room-editor',
    window: { title: 'Editar Salas', resizable: true },
    position: { width: 640, height: 520 },
    actions: {
      selectRoom: DungeonForgeRoomEditorApp.#onSelectRoom,
      changeShapeType: DungeonForgeRoomEditorApp.#onChangeShapeType,
      changeShapeParam: DungeonForgeRoomEditorApp.#onChangeShapeParam,
      resizeW: DungeonForgeRoomEditorApp.#onResizeW,
      resizeH: DungeonForgeRoomEditorApp.#onResizeH,
      toggleCell: DungeonForgeRoomEditorApp.#onToggleCell,
    },
  };

  static PARTS = {
    roomList: { template: 'modules/dungeon-forge/templates/room-editor-list.hbs' },
    detail: { template: 'modules/dungeon-forge/templates/room-editor-detail.hbs' },
  };

  constructor({ dungeon, ...options }) {
    super(options);
    this.dungeon = dungeon; // the in-memory Dungeon from Sub-project B — mutated directly, same convention as the harness
    this.selectedRoomId = dungeon.rooms[0]?.id ?? null;
  }
}
```

`_prepareContext` builds the same data `harness/src/room-manager.js`
already assembles by hand (rooms grouped by floor, the selected room's
`SHAPE_TYPES` state, the small-room warning, the disconnection warning) —
this is template *data preparation*, not new logic; every actual
computation (`smallRoomWarningApplies`, `isDisconnected`,
`defaultParamsFor`, `cellsFromRoom`, `toggleCustomCell`) calls straight into
`@dungeon-forge/room-shape-ui`, identical to what the harness calls today.

The detail panel's preview SVG comes from `buildShapeEditorSVG(room,
this.dungeon, gridSize, interactive)` — rendered into the template's markup
via a Handlebars helper that returns safe HTML (`{{{svg}}}`), and
`wireShapeEditorToggle` is called in `_onRender` (not `_prepareContext`,
since it needs real DOM nodes) exactly like `room-manager.js` already does,
just against this app's own rendered `element` instead of a hardcoded
`document.getElementById(...)`.

## Data flow back to the preview screen

`DungeonForgeRoomEditorApp` mutates `this.dungeon`'s room objects directly
(same live-apply convention already established in the harness — no
separate "save" step). Since `DungeonForgePreviewApp` passed the *same*
`Dungeon` object reference into this app's constructor, no explicit
data-passing-back is needed — closing this app and calling
`DungeonForgePreviewApp`'s own re-render method picks up the mutations for
free. `DungeonForgePreviewApp` opens this app via `render(true)` and awaits
its `close`d state (Foundry's `Application#close()` resolves a promise) to
know when to re-render its own preview image.

## Testing

- Unit tests for `_prepareContext`'s pure data-shaping logic (grouping
  rooms by floor, computing warnings) — same pattern as
  `packages/adapter-foundry/test/shared/*.test.js`, no Foundry globals
  needed for the pure parts.
- E2E: from the live Foundry, open the room editor from a real preview,
  change a room's shape to `'l'`, close the editor, confirm the preview
  image visibly changes (screenshot comparison or, more reliably, confirm
  the in-memory `Dungeon`'s `room.shape.type` actually changed before the
  image re-render call) — then continue to "Criar no Foundry" and confirm
  the *created* Scene's walls reflect the edited shape, not the original.
