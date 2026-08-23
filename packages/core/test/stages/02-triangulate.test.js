import { describe, it, expect } from 'vitest';
import { triangulate } from '../../src/stages/02-triangulate.js';

function room(id, cx, cy) {
  return { id, floor: 0, x: cx - 1, y: cy - 1, w: 2, h: 2, cx, cy, role: 'filler', doors: [] };
}

describe('triangulate', () => {
  it('returns no edges for fewer than 3 rooms', () => {
    expect(triangulate([room(0, 0, 0)])).toEqual([]);
    expect(triangulate([room(0, 0, 0), room(1, 5, 0)])).toHaveLength(1);
  });

  it('every edge has a < b (deduped, undirected)', () => {
    const rooms = [room(0, 0, 0), room(1, 5, 0), room(2, 0, 5), room(3, 5, 5)];
    const edges = triangulate(rooms);
    for (const e of edges) {
      expect(e.a).toBeLessThan(e.b);
    }
  });

  it('edge weight equals euclidean distance between centroids', () => {
    const rooms = [room(0, 0, 0), room(1, 3, 4), room(2, 10, 0)];
    const edges = triangulate(rooms);
    const e01 = edges.find((e) => (e.a === 0 && e.b === 1) || (e.a === 1 && e.b === 0));
    expect(e01.weight).toBeCloseTo(5, 5); // 3-4-5 triangle
  });

  it('produces no duplicate edges for a square of 4 rooms', () => {
    const rooms = [room(0, 0, 0), room(1, 10, 0), room(2, 10, 10), room(3, 0, 10)];
    const edges = triangulate(rooms);
    const seen = new Set();
    for (const e of edges) {
      const key = `${e.a}-${e.b}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
