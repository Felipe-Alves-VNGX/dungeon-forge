# @dungeon-forge/adapter-foundry

Foundry VTT v13 target for dungeon-forge. Loads directly in the browser as a
Foundry module (`esmodules`, no bundler) — this means it cannot use bare
package-name imports like `@dungeon-forge/core` at runtime (only Node/Vitest
can resolve those, via npm workspace symlinks). `src/` files import
`@dungeon-forge/core` via a relative path instead (`../../core/src/...`),
which requires a **sibling symlink** in the Foundry install:

```
Data/modules/dungeon-forge  -> <repo>/packages/adapter-foundry
Data/modules/core           -> <repo>/packages/core
```

Both symlinks are required for the module to load in a real Foundry
instance. `Data/modules/core` doesn't need its own `module.json` — Foundry
serves any file under `Data/` statically regardless of whether it's a
registered module, so this only needs to exist as a readable directory at
that path.
