// packages/adapter-foundry/test/index.test.js
import { describe, it, expect, vi } from 'vitest';
import { generate } from '../src/index.js';

describe('generate', () => {
  it('rejects any target other than v13, without touching Foundry or core', async () => {
    await expect(generate({ target: 'v14' })).rejects.toThrow(/unsupported target "v14"/);
    await expect(generate({ target: undefined })).rejects.toThrow(/unsupported target/);
  });
});

describe('module init (Node import safety)', () => {
  it('imports src/index.js without touching foundry.applications.api at module scope', async () => {
    // If index.js ever imports config-app.js statically at the top level
    // instead of dynamically inside Hooks.once, this import itself throws
    // here (foundry.applications.api doesn't exist in plain Node) — see
    // this package's ./helpers/foundry-stub.js and preview-app.js/config-app.js
    // for why those two files must guard the same way.
    await expect(import('../src/index.js')).resolves.toBeDefined();
  });
});
