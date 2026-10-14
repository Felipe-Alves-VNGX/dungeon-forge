# Design — adapter-foundry: config form + preview (Sub-project B)

## Context

`packages/adapter-foundry` currently exposes only a programmatic API
(`game.modules.get('dungeon-forge').api.generate(config)`), triggered from a
hand-written example macro — an explicit, approved scope decision from the
v13 target's own brainstorming (see
`docs/superpowers/specs/2026-09-02-adapter-foundry-v13-design.md`). This spec
replaces the macro-only entry point with a real GM-facing UI: a tabbed
configuration form covering the full `Config` shape, followed by a
no-commitment preview step before anything is actually created in Foundry.

## Credits / inspiration

Researched live before this design (not from training-data recall):

- **[DunGen](https://github.com/mouse0270/foundryvtt-dungen)** (MIT
  license, by mouse0270) — the "generate → preview → Create Scene" flow this
  spec's preview step follows directly comes from DunGen's UX: nothing is
  created in Foundry until the GM explicitly commits to a result they've
  already seen.
- **[Dungeon Crawl Classics (DCC) system](https://github.com/foundryvtt-dcc/dcc)**
  — its documented `ApplicationV2` + `HandlebarsApplicationMixin` reference
  (`docs/dev/V13.md`) is the technical pattern this spec's tabbed form
  structure follows: `DEFAULT_OPTIONS`/`PARTS`/`TABS` static fields, the
  `data-action` handler-mapping convention instead of `activateListeners`,
  and the "each tab is its own PART" rule for `HandlebarsApplicationMixin`
  tab rendering.

Both are credited in the shipped module's `README.md` and in `module.json`'s
`authors`/description, not just this design doc — see Testing/Docs below.

## Goals

- A GM can open a form from the module's settings menu, fill in the full
  `Config` shape across grouped tabs, and generate a preview without
  creating anything in Foundry yet.
- The preview shows the actual floor-plan image (via `@dungeon-forge/render`,
  the same renderer the harness already uses) and lets the GM regenerate
  (new random seed, same params) or go back and adjust before committing.
- Only one explicit action ("Criar no Foundry") calls `emitV13` for real.

## Non-goals (this sub-project)

- The room editor reachable from the preview screen — Sub-project C, separate
  spec, consumed as a dependency of this one but designed/planned on its own.
- A v14 equivalent form — out of scope until the v14 target exists at all.
- Saving/loading form presets — every open of the form starts from the
  example config's defaults; follow-up if requested later.

## Entry point

`Hooks.once('init', ...)` (already exists) additionally registers a settings
menu item:

```js
game.settings.registerMenu('dungeon-forge', 'generate', {
  name: 'Gerar Masmorra',
  label: 'Abrir',
  icon: 'fas fa-dungeon',
  type: DungeonForgeConfigApp,
  restricted: true, // GM only
});
```

## `DungeonForgeConfigApp` — the tabbed form

`ApplicationV2` + `HandlebarsApplicationMixin`, following the DCC reference
pattern:

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class DungeonForgeConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'dungeon-forge-config',
    tag: 'form',
    window: { title: 'Gerar Masmorra', resizable: true },
    position: { width: 520, height: 480 },
    form: { handler: DungeonForgeConfigApp.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: { reroll: DungeonForgeConfigApp.#onReroll },
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
}
```

Each tab's template covers exactly one group of `Config` fields (field list
below is the full config surface — the user explicitly chose "complete"
scope over the earlier "lean" option):

- **Geral:** `seed`, `floors`, `width`, `height`, `gridSize`
- **Salas:** `rooms.count/sizeMean/sizeStdDev/sizeMin/sizeMax/spawnRadius/separationIters`,
  plus a weighted shape table (rect/l/cross/circle/triangle, each a
  weight input — mirrors `RoomParams.shapes`, defaulting to the same
  `[{type:'rect',weight:1}]` the core itself defaults to)
- **Corredores:** `cycleRate`, `carve.newHallway/reuseHallway/throughRoom/turn`,
  `pruneIterations`
- **Escadas:** `verticalLinksPerGap`
- **Chave:** `key.scheme/numberJunctions/startAt/padTo/exitsInEntries`

Submitting (`#onSubmit`) calls `generateDungeon(config)` in memory (no
Foundry documents yet) and swaps to `DungeonForgePreviewApp` (below),
passing the generated `Dungeon` + the `config` that produced it.

## `DungeonForgePreviewApp` — the preview step

A second `ApplicationV2` window (not a tab of the first — this is a distinct
step in the flow, matching DunGen's separate "preview" screen rather than an
inline tab):

- Renders the current floor's image via
  `@dungeon-forge/render`'s `renderFloor(dungeon, floor, config.gridSize)`
  (the exact function `harness/src/main.js` already calls) into an `<img>`.
  A floor selector (only shown if `dungeon.floors > 1`) re-renders on change
  — cheap, `renderFloor` only touches the already-generated `Dungeon`, no
  regeneration.
- **"Gerar de novo"** — re-runs `generateDungeon` with a new random seed
  (everything else from the original `config` unchanged) and re-renders the
  preview in place.
- **"Voltar e ajustar"** — closes the preview, reopens
  `DungeonForgeConfigApp` pre-filled with the `config` that produced this
  preview (not the defaults).
- **"Editar salas"** — opens Sub-project C's room editor on the in-memory
  `Dungeon`; when it closes, the preview image re-renders to reflect any
  edits (still nothing created in Foundry).
- **"Criar no Foundry"** — the only button that calls
  `game.modules.get('dungeon-forge').api.generate`-equivalent logic for
  real: `emitV13(dungeon, config)` (the `Dungeon` already exists in memory
  at this point, including any edits from C, so this calls `emitV13`
  directly rather than re-running `generateDungeon` — the API's existing
  `generate(config)` function, which does both steps, stays as-is for the
  macro/scripting path; the UI flow calls the two steps separately so the
  preview can sit between them).

## Testing

- Unit tests for pure helpers this spec introduces (e.g. a
  `configFromFormData(formData)` function translating the form's flat field
  names into the nested `Config` shape `generateDungeon` expects, and the
  reverse `formDataFromConfig(config)` for pre-filling "Voltar e ajustar") —
  no Foundry globals needed for these, same convention as
  `packages/adapter-foundry/src/shared/geometry.js`.
- E2E verification against the live local Foundry (same method as the v13
  target's own plan): open the settings menu, launch the form, fill it,
  submit, confirm the preview image renders, click "Gerar de novo" and
  confirm a different layout appears, click "Criar no Foundry" and confirm
  the same real-document assertions the v13 plan already established
  (JournalEntry/Scenes/Regions counts, a real token teleport).

## Docs

`packages/adapter-foundry/README.md` gains a "Credits" section naming DunGen
and the DCC system's `V13.md` reference, with links, alongside the existing
build/deploy instructions.
