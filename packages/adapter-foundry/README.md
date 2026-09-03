# @dungeon-forge/adapter-foundry

Foundry VTT v13 target for dungeon-forge. Loads as a Foundry module
(`module.json`'s `esmodules`) directly in the browser, which cannot
resolve bare package-name imports (`@dungeon-forge/core`, `delaunator`)
the way Node/Vitest can — so this package ships a **bundled** output
instead of raw source.

## Build

```bash
npm run build --workspace=@dungeon-forge/adapter-foundry
```

This uses `esbuild` to bundle `src/index.js` and its entire dependency
graph (including `@dungeon-forge/core` and `core`'s own `delaunator`
dependency) into a single self-contained `dist/index.js`, which is what
`module.json`'s `esmodules` actually points to. **Any change to `src/`
requires re-running this build before Foundry will see it** — reloading
the world alone is not enough, since Foundry only ever loads
`dist/index.js`.

## Dev deployment

Symlink this package's directory into a local Foundry install's modules
folder, matching `module.json`'s `id`:
```bash
ln -s "$(pwd)/packages/adapter-foundry" <foundry-data>/Data/modules/dungeon-forge
```
No other symlink is needed — the bundle is self-contained.
