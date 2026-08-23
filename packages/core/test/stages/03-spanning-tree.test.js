import { describe, it, expect } from 'vitest';
import { spanningTree } from '../../src/stages/03-spanning-tree.js';

function room(id) {
  return { id, floor: 0, x: 0, y: 0, w: 1, h: 1, cx: id, cy: 0, role: 'filler', doors: [] };
}

describe('spanningTree', () => {
  it('returns V-1 edges for a connected input graph', () => {
    const rooms = [room(0), room(1), room(2), room(3)];
    const edges = [
      { a: 0, b: 1, weight: 1 },
      { a: 1, b: 2, weight: 1 },
      { a: 2, b: 3, weight: 1 },
      { a: 0, b: 3, weight: 5 },
      { a: 0, b: 2, weight: 3 },
    ];
    const mst = spanningTree(rooms, edges);
    expect(mst).toHaveLength(rooms.length - 1);
  });

  it('every returned edge is tagged kind: "mst"', () => {
    const rooms = [room(0), room(1), room(2)];
    const edges = [
      { a: 0, b: 1, weight: 1 },
      { a: 1, b: 2, weight: 1 },
      { a: 0, b: 2, weight: 2 },
    ];
    const mst = spanningTree(rooms, edges);
    expect(mst.every((e) => e.kind === 'mst')).toBe(true);
  });

  it('the result graph is connected (reaches every room)', () => {
    const rooms = [room(0), room(1), room(2), room(3), room(4)];
    const edges = [
      { a: 0, b: 1, weight: 1 },
      { a: 1, b: 2, weight: 1 },
      { a: 2, b: 3, weight: 1 },
      { a: 3, b: 4, weight: 1 },
      { a: 0, b: 4, weight: 10 },
    ];
    const mst = spanningTree(rooms, edges);
    const adj = new Map(rooms.map((r) => [r.id, []]));
    for (const e of mst) {
      adj.get(e.a).push(e.b);
      adj.get(e.b).push(e.a);
    }
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const cur = stack.pop();
      for (const next of adj.get(cur)) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    expect(seen.size).toBe(rooms.length);
  });

  it('picks the lower-weight edge when a cheaper alternative exists', () => {
    const rooms = [room(0), room(1), room(2)];
    const edges = [
      { a: 0, b: 1, weight: 1 },
      { a: 1, b: 2, weight: 1 },
      { a: 0, b: 2, weight: 100 },
    ];
    const mst = spanningTree(rooms, edges);
    const hasExpensive = mst.some((e) => e.weight === 100);
    expect(hasExpensive).toBe(false);
  });
});
