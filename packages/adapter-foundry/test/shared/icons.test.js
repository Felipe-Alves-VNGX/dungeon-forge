// packages/adapter-foundry/test/shared/icons.test.js
import { describe, it, expect } from 'vitest';
import { iconForRole } from '../../src/shared/icons.js';

describe('iconForRole', () => {
  it('returns a distinct icon path for each of the 5 known roles', () => {
    const roles = ['entrance', 'climax', 'treasure', 'junction', 'filler'];
    const icons = roles.map(iconForRole);
    expect(new Set(icons).size).toBe(5); // all distinct
    for (const icon of icons) expect(icon).toMatch(/^icons\/svg\/.+\.svg$/);
  });
});
