// harness/test/shape-editor.test.js
import { describe, it, expect } from 'vitest';
import { SHAPE_TYPES, defaultParamsFor, smallRoomWarningApplies, buildShapeEditorSVG, cellsFromRoom, toggleCustomCell, isDisconnected, wireShapeEditorToggle, applyShapeType, applyShapeParam, applySizeDelta, applyCustomToggle } from '../src/shape-editor.js';

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
  it('is false for custom regardless of size, since custom has no degenerate-shape concept', () => {
    expect(smallRoomWarningApplies('custom', 3, 3)).toBe(false);
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

describe('applyShapeType', () => {
  it('sets a non-custom type, falling back to rect when the room is too small for it', () => {
    const room = { x: 0, y: 0, w: 3, h: 3, shape: { type: 'rect', params: {} } };
    applyShapeType(room, 'l'); // 'l' needs w,h >= 4; room is 3x3
    expect(room.shape.type).toBe('rect');
  });

  it('sets a non-custom type with its default params when the room is big enough', () => {
    const room = { x: 0, y: 0, w: 6, h: 6, shape: { type: 'rect', params: {} } };
    applyShapeType(room, 'l');
    expect(room.shape).toEqual({ type: 'l', params: { corner: 'nw' } });
  });

  it('switching to custom captures the room\'s current rasterized cells', () => {
    const room = { x: 2, y: 3, w: 2, h: 2, shape: { type: 'rect', params: {} } };
    applyShapeType(room, 'custom');
    expect(room.shape.type).toBe('custom');
    expect(room.shape.params.cells).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });
});

describe('applyShapeParam', () => {
  it('replaces the param object for the current shape type', () => {
    const room = { shape: { type: 'l', params: { corner: 'nw' } } };
    applyShapeParam(room, 'se');
    expect(room.shape).toEqual({ type: 'l', params: { corner: 'se' } });
  });

  it('does nothing if the current shape type has no param', () => {
    const room = { shape: { type: 'rect', params: {} } };
    applyShapeParam(room, 'anything');
    expect(room.shape).toEqual({ type: 'rect', params: {} });
  });
});

describe('applySizeDelta', () => {
  it('grows w within the dungeon bounds and recenters cx', () => {
    const room = { x: 0, y: 0, w: 6, h: 6, cx: 3, cy: 3, shape: { type: 'rect', params: {} } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', 1);
    expect(room.w).toBe(7);
    expect(room.cx).toBe(3.5);
  });

  it('clamps growth at the dungeon edge', () => {
    const room = { x: 18, y: 0, w: 2, h: 2, cx: 19, cy: 1, shape: { type: 'rect', params: {} } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', 5);
    expect(room.w).toBe(2); // 20 - x(18) = max 2, already at max
  });

  it('never shrinks below 1', () => {
    const room = { x: 0, y: 0, w: 1, h: 1, cx: 0.5, cy: 0.5, shape: { type: 'rect', params: {} } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', -5);
    expect(room.w).toBe(1);
  });

  it('reverts a too-small non-rect shape back to rect', () => {
    const room = { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, shape: { type: 'l', params: { corner: 'nw' } } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', -1); // now 3x4, too small for 'l'
    expect(room.shape).toEqual({ type: 'rect', params: {} });
  });

  it('is a no-op in custom mode', () => {
    const room = { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, shape: { type: 'custom', params: { cells: [[0, 0]] } } };
    const dungeon = { width: 20, height: 20 };
    applySizeDelta(room, dungeon, 'w', 1);
    expect(room.w).toBe(4);
  });
});

describe('applyCustomToggle', () => {
  it('adds a cell and re-anchors the bounding box when it extends beyond the current origin', () => {
    const room = { x: 5, y: 5, w: 1, h: 1, cx: 5.5, cy: 5.5, shape: { type: 'custom', params: { cells: [[0, 0]] } } };
    applyCustomToggle(room, 4, 5); // one cell to the left of the origin
    expect(room.x).toBe(4);
    expect(room.w).toBe(2);
    expect(room.shape.params.cells).toEqual(expect.arrayContaining([[0, 0], [1, 0]]));
  });

  it('removes a cell without re-adding it if it was the last one (toggleCustomCell keeps at least one)', () => {
    const room = { x: 5, y: 5, w: 1, h: 1, cx: 5.5, cy: 5.5, shape: { type: 'custom', params: { cells: [[0, 0]] } } };
    applyCustomToggle(room, 5, 5); // toggling the only existing cell
    expect(room.shape.params.cells).toEqual([[0, 0]]);
  });
});
