// packages/adapter-foundry/src/index.js
//
// Foundry module entry point (module.json's esmodules[0]). Registers the
// generate() API on the module's own game.modules entry, per Foundry's
// standard module-API convention — a macro (see ../macros/gerar-masmorra.js)
// calls game.modules.get('dungeon-forge').api.generate(config); the GM can
// also open a graphical form from a "Gerar Masmorra" button injected into
// the Scenes sidebar directory, right alongside Foundry's own "Create
// Scene" button — since what this module ultimately produces are Scenes,
// that's where a GM naturally looks for it, not buried in Game Settings.
// That button opens DungeonForgeConfigApp, which walks
// generate -> preview -> emitV13 through DungeonForgeConfigApp /
// DungeonForgePreviewApp.
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

  Hooks.on('renderSceneDirectory', (app, html) => {
    if (!game.user.isGM) return;
    const actions = html.querySelector('.header-actions.action-buttons');
    if (!actions || actions.querySelector('.dungeon-forge-generate')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dungeon-forge-generate';
    button.innerHTML = '<i class="fas fa-dungeon"></i><span>Gerar Masmorra</span>';
    button.addEventListener('click', async () => {
      const { DungeonForgeConfigApp } = await import('./config-app.js');
      new DungeonForgeConfigApp().render(true);
    });
    actions.appendChild(button);
  });
}
