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
