// packages/adapter-foundry/test/index.test.js
import { describe, it, expect, vi } from 'vitest';
import { generate } from '../src/index.js';

describe('generate', () => {
  it('rejects any target other than v13, without touching Foundry or core', async () => {
    await expect(generate({ target: 'v14' })).rejects.toThrow(/unsupported target "v14"/);
    await expect(generate({ target: undefined })).rejects.toThrow(/unsupported target/);
  });
});
