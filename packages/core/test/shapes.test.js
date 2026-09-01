import { describe, it, expect } from 'vitest';
import { deriveRng } from '../src/rng.js';
import { rasterizeL, rasterizeRect, rasterizeRoom, sampleShapeParams, rasterizeCross, rasterizeCircle } from '../src/shapes.js';

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

describe('rasterizeL', () => {
  const corners = ['nw', 'ne', 'sw', 'se'];

  it('contains the rounded centroid for every corner and a range of sizes', () => {
    for (const corner of corners) {
      for (const [w, h] of [[3, 3], [4, 5], [6, 6], [10, 7]]) {
        const r = room(0, 0, w, h);
        const cells = rasterizeL(r, { corner });
        const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
        expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
      }
    }
  });

  it('is strictly fewer cells than the full bounding box for large-enough rooms', () => {
    const r = room(0, 0, 8, 8);
    const cells = rasterizeL(r, { corner: 'ne' });
    expect(cells.length).toBeLessThan(r.w * r.h);
  });

  it('every returned cell is within the bounding box', () => {
    const r = room(5, 5, 7, 6);
    const cells = rasterizeL(r, { corner: 'sw' });
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(r.x);
      expect(c.x).toBeLessThan(r.x + r.w);
      expect(c.y).toBeGreaterThanOrEqual(r.y);
      expect(c.y).toBeLessThan(r.y + r.h);
    }
  });
});

describe('sampleShapeParams("l", rng)', () => {
  it('returns one of the four corners, deterministically for a given seed', () => {
    const rngA = deriveRng('seed-l', 'shape-params');
    const rngB = deriveRng('seed-l', 'shape-params');
    const a = sampleShapeParams('l', rngA);
    const b = sampleShapeParams('l', rngB);
    expect(['nw', 'ne', 'sw', 'se']).toContain(a.corner);
    expect(a).toEqual(b);
  });
});

describe('rasterizeCross', () => {
  it('contains the rounded centroid for a range of sizes', () => {
    for (const [w, h] of [[3, 3], [4, 5], [6, 6], [10, 7]]) {
      const r = room(0, 0, w, h);
      const cells = rasterizeCross(r);
      const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
      expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
    }
  });

  it('excludes all four corners for a large-enough room', () => {
    const r = room(0, 0, 9, 9);
    const cells = rasterizeCross(r);
    const set = new Set(cells.map((c) => `${c.x},${c.y}`));
    // Corner cells of the bbox should be excluded.
    expect(set.has(`${r.x},${r.y}`)).toBe(false);
    expect(set.has(`${r.x + r.w - 1},${r.y}`)).toBe(false);
    expect(set.has(`${r.x},${r.y + r.h - 1}`)).toBe(false);
    expect(set.has(`${r.x + r.w - 1},${r.y + r.h - 1}`)).toBe(false);
  });

  it('is strictly fewer cells than the full bounding box for large-enough rooms', () => {
    const r = room(0, 0, 9, 9);
    const cells = rasterizeCross(r);
    expect(cells.length).toBeLessThan(r.w * r.h);
  });
});

describe('rasterizeCircle', () => {
  it('contains the rounded centroid for a range of sizes', () => {
    for (const [w, h] of [[3, 3], [4, 5], [6, 6], [10, 7]]) {
      const r = room(0, 0, w, h);
      const cells = rasterizeCircle(r);
      const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
      expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
    }
  });

  it('excludes all four corners for a large-enough room', () => {
    const r = room(0, 0, 9, 9);
    const cells = rasterizeCircle(r);
    const set = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(set.has(`${r.x},${r.y}`)).toBe(false);
    expect(set.has(`${r.x + r.w - 1},${r.y}`)).toBe(false);
    expect(set.has(`${r.x},${r.y + r.h - 1}`)).toBe(false);
    expect(set.has(`${r.x + r.w - 1},${r.y + r.h - 1}`)).toBe(false);
  });

  it('every returned cell is within the bounding box', () => {
    const r = room(3, 3, 9, 7);
    const cells = rasterizeCircle(r);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(r.x);
      expect(c.x).toBeLessThan(r.x + r.w);
      expect(c.y).toBeGreaterThanOrEqual(r.y);
      expect(c.y).toBeLessThan(r.y + r.h);
    }
  });
});
