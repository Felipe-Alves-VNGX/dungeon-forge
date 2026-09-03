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
    this.renderToken = 0;
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
    const token = ++this.renderToken;
    const { blob } = await renderFloor(this.dungeon, this.floor, this.config.gridSize);
    if (token === this.renderToken) {
      if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = URL.createObjectURL(blob);
      const img = this.element.querySelector('[data-preview-image]');
      if (img) img.src = this.imageUrl;
    }

    const select = this.element.querySelector('[data-floor-select]');
    if (select && !select.dataset.listenerBound) {
      select.dataset.listenerBound = 'true';
      select.addEventListener('change', async (event) => {
        this.floor = Number(event.target.value);
        await this.render();
      });
    }
  }

  async close(options) {
    if (this.imageUrl) {
      URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = null;
    }
    return super.close(options);
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
    const { DungeonForgeRoomEditorApp } = await import('./room-editor-app.js');
    if (this.roomEditorApp && this.roomEditorApp.rendered) {
      this.roomEditorApp.bringToFront();
      return;
    }
    this.roomEditorApp = new DungeonForgeRoomEditorApp({
      dungeon: this.dungeon,
      onClose: () => this.render(),
    });
    this.roomEditorApp.render(true);
  }

  static async #onCreate() {
    try {
      const result = await emitV13(this.dungeon, this.config);
      ui.notifications.info(`Dungeon Forge: criado "${result.journal.name}" com ${result.scenes.length} Scene(s).`);
      await this.close();
    } catch (error) {
      ui.notifications.error(`Dungeon Forge: falha ao criar a masmorra — ${error.message}`);
      console.error('Dungeon Forge: emitV13 failed', error);
    }
  }
}
