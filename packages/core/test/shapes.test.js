import { describe, it, expect } from 'vitest';
import { rasterizeRect, rasterizeRoom } from '../src/shapes.js';

function room(x, y, w, h, shape) {
  return { id: 0, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [], shape };
}

describe('rasterizeRect', () => {
  it('returns exactly the bounding box cells', () => {
    const r = room(2, 3, 4, 3);
    const cells = rasterizeRect(r);
    expect(cells).toHaveLength(4 * 3);
    const key = (c) => `${c.x},${c.y}`;
    const set = new Set(cells.map(key));
    for (let y = 3; y < 6; y++) {
      for (let x = 2; x < 6; x++) {
        expect(set.has(`${x},${y}`)).toBe(true);
      }
    }
  });

  it('contains the rounded centroid', () => {
    const r = room(0, 0, 5, 5);
    const cells = rasterizeRect(r);
    const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
    expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
  });
});

describe('rasterizeRoom dispatcher', () => {
  it('defaults to rect when room.shape is absent', () => {
    const r = room(1, 1, 3, 3, undefined);
    expect(rasterizeRoom(r)).toEqual(rasterizeRect(r));
  });

  it('defaults to rect when room.shape.type is "rect"', () => {
    const r = room(1, 1, 3, 3, { type: 'rect', params: {} });
    expect(rasterizeRoom(r)).toEqual(rasterizeRect(r));
  });

  it('throws on an unknown shape type', () => {
    const r = room(1, 1, 3, 3, { type: 'nonsense', params: {} });
    expect(() => rasterizeRoom(r)).toThrow(/unknown shape type/);
  });
});
