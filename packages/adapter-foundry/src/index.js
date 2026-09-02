// packages/adapter-foundry/src/index.js
//
// Foundry module entry point (module.json's esmodules[0]). Registers the
// generate() API on the module's own game.modules entry, per Foundry's
// standard module-API convention — a macro (see ../macros/gerar-masmorra.js)
// calls game.modules.get('dungeon-forge').api.generate(config).
// Foundry loads esmodules directly in the browser (no bundler, no node_modules
// resolution) — a bare specifier like '@dungeon-forge/core' cannot resolve there,
// only in Node/Vitest via npm workspace symlinks. This relative path resolves
// via standard browser ESM URL resolution instead, requiring a sibling symlink
// of packages/core at Data/modules/core alongside this module's own symlink
// (documented in the package's README/deploy notes — see Task 5's follow-up).
import { generateDungeon } from '../../core/src/pipeline.js';
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
