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
