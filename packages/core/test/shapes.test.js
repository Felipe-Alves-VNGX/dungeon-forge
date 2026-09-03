import { describe, it, expect } from 'vitest';
import { deriveRng } from '../src/rng.js';
import { rasterizeL, rasterizeRect, rasterizeRoom, sampleShapeParams, rasterizeCross, rasterizeCircle, rasterizeTriangle } from '../src/shapes.js';

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

describe('rasterizeTriangle', () => {
  const orientations = ['up', 'down', 'left', 'right'];

  it('contains the rounded centroid for every orientation and a range of sizes', () => {
    for (const orientation of orientations) {
      for (const [w, h] of [[4, 4], [5, 7], [8, 3], [9, 9]]) {
        const r = room(0, 0, w, h);
        const cells = rasterizeTriangle(r, { orientation });
        const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
        expect(cells.map((c) => `${c.x},${c.y}`)).toContain(target);
      }
    }
  });

  it('is strictly fewer cells than the full bounding box for large-enough rooms', () => {
    const r = room(0, 0, 9, 9);
    for (const orientation of orientations) {
      expect(rasterizeTriangle(r, { orientation }).length).toBeLessThan(r.w * r.h);
    }
  });

  it('every returned cell is within the bounding box', () => {
    const r = room(4, 4, 8, 6);
    for (const orientation of orientations) {
      for (const c of rasterizeTriangle(r, { orientation })) {
        expect(c.x).toBeGreaterThanOrEqual(r.x);
        expect(c.x).toBeLessThan(r.x + r.w);
        expect(c.y).toBeGreaterThanOrEqual(r.y);
        expect(c.y).toBeLessThan(r.y + r.h);
      }
    }
  });

  it('centroid cell always has at least one orthogonal neighbor within the triangle', () => {
    for (const orientation of orientations) {
      for (const [w, h] of [[4, 4], [5, 7], [8, 3], [9, 9]]) {
        const r = room(0, 0, w, h);
        const cells = rasterizeTriangle(r, { orientation });
        const centroidX = Math.round(r.cx);
        const centroidY = Math.round(r.cy);

        // Build a set of all cell coordinates for fast lookup
        const cellSet = new Set(cells.map((c) => `${c.x},${c.y}`));

        // The centroid cell must be present
        const centroidKey = `${centroidX},${centroidY}`;
        expect(cellSet.has(centroidKey)).toBe(true);

        // The centroid must have at least one orthogonal neighbor (up/down/left/right)
        const hasOrthogonalNeighbor =
          cellSet.has(`${centroidX - 1},${centroidY}`) ||  // left
          cellSet.has(`${centroidX + 1},${centroidY}`) ||  // right
          cellSet.has(`${centroidX},${centroidY - 1}`) ||  // up
          cellSet.has(`${centroidX},${centroidY + 1}`);    // down

        expect(hasOrthogonalNeighbor).toBe(true);
      }
    }
  });

  it('throws on an unknown orientation', () => {
    const r = room(0, 0, 5, 5);
    expect(() => rasterizeTriangle(r, { orientation: 'sideways' })).toThrow(/unknown orientation/);
  });
});

describe('sampleShapeParams("triangle", rng)', () => {
  it('returns one of the four orientations, deterministically for a given seed', () => {
    const rngA = deriveRng('seed-tri', 'shape-params');
    const rngB = deriveRng('seed-tri', 'shape-params');
    const a = sampleShapeParams('triangle', rngA);
    const b = sampleShapeParams('triangle', rngB);
    expect(['up', 'down', 'left', 'right']).toContain(a.orientation);
    expect(a).toEqual(b);
  });
});

describe('rasterizeCustom', () => {
  it('returns exactly the stored cells translated by room.x/room.y, in order', () => {
    const r = room(5, 5, 3, 3, { type: 'custom', params: { cells: [[0, 0], [2, 2], [1, 0]] } });
    const cells = rasterizeRoom(r);
    expect(cells).toEqual([{ x: 5, y: 5 }, { x: 7, y: 7 }, { x: 6, y: 5 }]);
  });

  it('does not guarantee the rounded centroid is included (unlike the other 5 shapes)', () => {
    // A 4x4 room's rounded centroid is (round(cx), round(cy)) = local (2,2).
    // This custom cell list deliberately excludes it.
    const cells = [];
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        if (dx === 2 && dy === 2) continue;
        cells.push([dx, dy]);
      }
    }
    const r = room(0, 0, 4, 4, { type: 'custom', params: { cells } });
    const result = rasterizeRoom(r);
    const target = `${Math.round(r.cx)},${Math.round(r.cy)}`;
    expect(result.map((c) => `${c.x},${c.y}`)).not.toContain(target);
  });
});
