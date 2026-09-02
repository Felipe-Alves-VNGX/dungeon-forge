// harness/test/shape-editor.test.js
import { describe, it, expect } from 'vitest';
import { SHAPE_TYPES, defaultParamsFor, smallRoomWarningApplies, buildShapeEditorSVG } from '../src/shape-editor.js';

function room(x, y, w, h, shape) {
  return { id: 0, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [], shape };
}

describe('SHAPE_TYPES', () => {
  it('lists exactly the 5 macro shape types in order, with param config only for l and triangle', () => {
    expect(SHAPE_TYPES.map((s) => s.type)).toEqual(['rect', 'l', 'cross', 'circle', 'triangle']);
    expect(SHAPE_TYPES.find((s) => s.type === 'rect').param).toBeNull();
    expect(SHAPE_TYPES.find((s) => s.type === 'cross').param).toBeNull();
    expect(SHAPE_TYPES.find((s) => s.type === 'circle').param).toBeNull();
    expect(SHAPE_TYPES.find((s) => s.type === 'l').param.key).toBe('corner');
    expect(SHAPE_TYPES.find((s) => s.type === 'triangle').param.key).toBe('orientation');
  });
});

describe('defaultParamsFor', () => {
  it('returns an empty object for param-less types', () => {
    expect(defaultParamsFor('rect')).toEqual({});
    expect(defaultParamsFor('cross')).toEqual({});
    expect(defaultParamsFor('circle')).toEqual({});
  });
  it('returns the first option for l (corner) and triangle (orientation)', () => {
    expect(defaultParamsFor('l')).toEqual({ corner: 'nw' });
    expect(defaultParamsFor('triangle')).toEqual({ orientation: 'up' });
  });
});

describe('smallRoomWarningApplies', () => {
  it('is false for rect regardless of size', () => {
    expect(smallRoomWarningApplies('rect', 2, 2)).toBe(false);
  });
  it('is true for a non-rect type below 4 on either side', () => {
    expect(smallRoomWarningApplies('l', 3, 5)).toBe(true);
    expect(smallRoomWarningApplies('cross', 5, 3)).toBe(true);
  });
  it('is false for a non-rect type at 4 or above on both sides', () => {
    expect(smallRoomWarningApplies('l', 4, 4)).toBe(false);
    expect(smallRoomWarningApplies('circle', 6, 5)).toBe(false);
  });
});

describe('buildShapeEditorSVG', () => {
  it('renders one shape-cell-on rect per cell in rasterizeRoom(room)', () => {
    const r = room(5, 5, 4, 4, { type: 'circle', params: {} });
    const dungeon = { width: 40, height: 40 };
    const svg = buildShapeEditorSVG(r, dungeon, 20);
    const matches = svg.match(/class="shape-cell-on"/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(16); // circle excludes corners of its 4x4 bbox
  });

  it('is read-only markup: no data-cx/data-cy toggle attributes', () => {
    const r = room(0, 0, 3, 3);
    const dungeon = { width: 40, height: 40 };
    const svg = buildShapeEditorSVG(r, dungeon, 20);
    expect(svg).not.toContain('data-cx');
  });
});
