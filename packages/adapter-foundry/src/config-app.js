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
