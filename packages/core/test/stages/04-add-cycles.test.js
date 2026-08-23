import { describe, it, expect } from 'vitest';
import { deriveRng } from '../../src/rng.js';
import { addCycles } from '../../src/stages/04-add-cycles.js';

describe('addCycles', () => {
  const allEdges = [
    { a: 0, b: 1, weight: 1 },
    { a: 1, b: 2, weight: 1 },
    { a: 0, b: 2, weight: 2 },
    { a: 2, b: 3, weight: 1 },
  ];
  const mstEdges = [
    { a: 0, b: 1, weight: 1, kind: 'mst' },
    { a: 1, b: 2, weight: 1, kind: 'mst' },
    { a: 2, b: 3, weight: 1, kind: 'mst' },
  ];

  it('always includes every MST edge unchanged', () => {
    const result = addCycles(allEdges, mstEdges, 0, deriveRng('s', 'cycles'));
    for (const e of mstEdges) {
      expect(result).toContainEqual(e);
    }
  });

  it('cycleRate 0 never adds a cycle edge', () => {
    const result = addCycles(allEdges, mstEdges, 0, deriveRng('s', 'cycles'));
    expect(result.filter((e) => e.kind === 'cycle')).toHaveLength(0);
  });

  it('cycleRate 1 adds every non-MST edge as a cycle', () => {
    const result = addCycles(allEdges, mstEdges, 1, deriveRng('s', 'cycles'));
    const cycles = result.filter((e) => e.kind === 'cycle');
    expect(cycles).toHaveLength(1); // only (0,2) is not in the MST
    expect(cycles[0]).toMatchObject({ a: 0, b: 2 });
  });

  it('is deterministic for the same seed', () => {
    const r1 = addCycles(allEdges, mstEdges, 0.5, deriveRng('same', 'cycles'));
    const r2 = addCycles(allEdges, mstEdges, 0.5, deriveRng('same', 'cycles'));
    expect(r1).toEqual(r2);
  });
});
