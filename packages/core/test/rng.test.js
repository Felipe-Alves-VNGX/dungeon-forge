import { describe, it, expect } from 'vitest';
import { makeRng, deriveRng } from '../src/rng.js';

describe('makeRng', () => {
  it('is deterministic for the same seed', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-1');
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-2');
    expect(a.float()).not.toEqual(b.float());
  });

  it('float() stays within [0, 1)', () => {
    const rng = makeRng('bounds');
    for (let i = 0; i < 1000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) stays within [min, max] inclusive', () => {
    const rng = makeRng('int-bounds');
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('normal(mean, stdDev) is centered near mean over many samples', () => {
    const rng = makeRng('normal-dist');
    const samples = Array.from({ length: 5000 }, () => rng.normal(10, 2));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(9.5);
    expect(mean).toBeLessThan(10.5);
  });

  it('pick(array) always returns an element of the array', () => {
    const rng = makeRng('pick');
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('shuffle(array) is a permutation of the input', () => {
    const rng = makeRng('shuffle');
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle([...arr]);
    expect(shuffled.slice().sort()).toEqual(arr.slice().sort());
  });

  it('chance(p) returns true roughly p of the time', () => {
    const rng = makeRng('chance');
    let hits = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (rng.chance(0.3)) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.25);
    expect(hits / n).toBeLessThan(0.35);
  });

  it('chance(0) never true, chance(1) always true', () => {
    const rng = makeRng('chance-edges');
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});

describe('deriveRng', () => {
  it('same rootSeed + stageName is deterministic', () => {
    const a = deriveRng('root', 'stage-a');
    const b = deriveRng('root', 'stage-a');
    expect(a.float()).toEqual(b.float());
  });

  it('different stageName under the same rootSeed diverges', () => {
    const a = deriveRng('root', 'stage-a');
    const b = deriveRng('root', 'stage-b');
    expect(a.float()).not.toEqual(b.float());
  });

  it('substream for one stage is independent of another stage\'s call count', () => {
    // Draw 50 values from stage-a first; stage-b's first value must be
    // unaffected by how much stage-a consumed.
    const a1 = deriveRng('root', 'stage-a');
    for (let i = 0; i < 50; i++) a1.float();

    const b1 = deriveRng('root', 'stage-b');
    const bFirst = b1.float();

    const b2 = deriveRng('root', 'stage-b');
    expect(b2.float()).toEqual(bFirst);
  });
});

describe('Rng.weightedPick', () => {
  it('always returns an entry with zero weight everywhere else', () => {
    const rng = deriveRng('seed-1', 'weighted-pick');
    const entries = [{ id: 'a', weight: 0 }, { id: 'b', weight: 1 }, { id: 'c', weight: 0 }];
    for (let i = 0; i < 20; i++) {
      expect(rng.weightedPick(entries, (e) => e.weight).id).toBe('b');
    }
  });

  it('is deterministic for the same seed', () => {
    const entries = [{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }, { id: 'c', weight: 3 }];
    const rngA = deriveRng('seed-2', 'weighted-pick');
    const rngB = deriveRng('seed-2', 'weighted-pick');
    const picksA = Array.from({ length: 30 }, () => rngA.weightedPick(entries, (e) => e.weight).id);
    const picksB = Array.from({ length: 30 }, () => rngB.weightedPick(entries, (e) => e.weight).id);
    expect(picksA).toEqual(picksB);
  });

  it('over many draws, picks each entry roughly proportional to its weight', () => {
    const rng = deriveRng('seed-3', 'weighted-pick');
    const entries = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
    const counts = { a: 0, b: 0 };
    const n = 4000;
    for (let i = 0; i < n; i++) counts[rng.weightedPick(entries, (e) => e.weight).id]++;
    // Expect ~25%/75% split; generous tolerance since this is a statistical check.
    expect(counts.a / n).toBeGreaterThan(0.15);
    expect(counts.a / n).toBeLessThan(0.35);
  });

  it('single-entry table always returns that entry', () => {
    const rng = deriveRng('seed-4', 'weighted-pick');
    const entries = [{ id: 'only', weight: 1 }];
    expect(rng.weightedPick(entries, (e) => e.weight).id).toBe('only');
  });
});
