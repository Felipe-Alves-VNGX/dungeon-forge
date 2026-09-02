// harness/test/shape-editor.test.js
import { describe, it, expect } from 'vitest';
import { SHAPE_TYPES, defaultParamsFor, smallRoomWarningApplies, buildShapeEditorSVG, cellsFromRoom, toggleCustomCell, isDisconnected, wireShapeEditorToggle } from '../src/shape-editor.js';

function room(x, y, w, h, shape) {
  return { id: 0, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [], shape };
}

describe('SHAPE_TYPES', () => {
  it('lists the macro shape types in order, with param config only for l and triangle', () => {
    expect(SHAPE_TYPES.slice(0, 5).map((s) => s.type)).toEqual(['rect', 'l', 'cross', 'circle', 'triangle']);
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

describe('SHAPE_TYPES (custom)', () => {
  it('includes a 6th, param-less custom entry', () => {
    expect(SHAPE_TYPES.map((s) => s.type)).toEqual(['rect', 'l', 'cross', 'circle', 'triangle', 'custom']);
    expect(SHAPE_TYPES.find((s) => s.type === 'custom').param).toBeNull();
  });
});

describe('cellsFromRoom', () => {
  it('converts rasterizeRoom output into relative dx,dy pairs', () => {
    const r = room(5, 5, 2, 2); // plain rect, no shape
    expect(cellsFromRoom(r)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });
});

describe('toggleCustomCell', () => {
  const r = room(5, 5, 3, 3);

  it('adds an absolute cell not already present', () => {
    const next = toggleCustomCell([[0, 0]], r, 6, 5); // absolute (6,5) -> relative (1,0)
    expect(next).toEqual([[0, 0], [1, 0]]);
  });

  it('removes an absolute cell already present', () => {
    const next = toggleCustomCell([[0, 0], [1, 0]], r, 6, 5);
    expect(next).toEqual([[0, 0]]);
  });

  it('refuses to remove the last remaining cell', () => {
    const next = toggleCustomCell([[0, 0]], r, 5, 5); // absolute (5,5) -> relative (0,0), the only cell
    expect(next).toEqual([[0, 0]]);
  });
});

describe('isDisconnected', () => {
  it('is false for an empty or single-cell list', () => {
    expect(isDisconnected([])).toBe(false);
    expect(isDisconnected([[0, 0]])).toBe(false);
  });
  it('is false for a 4-connected set', () => {
    expect(isDisconnected([[0, 0], [1, 0], [1, 1]])).toBe(false);
  });
  it('is true for two separate islands', () => {
    expect(isDisconnected([[0, 0], [5, 5]])).toBe(true);
  });
});

describe('buildShapeEditorSVG (interactive mode)', () => {
  it('adds data-cx/data-cy and shape-cell class to every cell in the padded area when interactive', () => {
    const r = room(5, 5, 2, 2, { type: 'custom', params: { cells: [[0, 0]] } });
    const dungeon = { width: 40, height: 40 };
    const svg = buildShapeEditorSVG(r, dungeon, 20, true);
    expect(svg).toContain('data-cx');
    expect(svg).toContain('class="shape-cell shape-cell-on"');
  });

  it('is unchanged (read-only, no data-cx) when interactive is false or omitted', () => {
    const r = room(5, 5, 2, 2);
    const dungeon = { width: 40, height: 40 };
    expect(buildShapeEditorSVG(r, dungeon, 20)).not.toContain('data-cx');
  });
});
