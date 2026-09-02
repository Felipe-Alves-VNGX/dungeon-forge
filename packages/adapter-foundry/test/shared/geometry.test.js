// packages/adapter-foundry/test/shared/geometry.test.js
import { describe, it, expect } from 'vitest';
import { toPixel, buildWallData, buildNoteData } from '../../src/shared/geometry.js';

describe('toPixel', () => {
  it('multiplies a cell coordinate by gridSize', () => {
    expect(toPixel(5, 100)).toBe(500);
    expect(toPixel(0, 100)).toBe(0);
  });
});

describe('buildWallData', () => {
  const gridSize = 100;

  it('builds a plain wall (isDoor false) with door:0', () => {
    const wall = { floor: 0, x1: 2, y1: 3, x2: 4, y2: 3, isDoor: false, doorId: null };
    const data = buildWallData(wall, new Map(), gridSize);
    expect(data).toEqual({
      c: [200, 300, 400, 300],
      light: 20, move: 20, sight: 20, sound: 20, dir: 0, door: 0, ds: 0,
    });
  });

  it('builds a normal door wall (isDoor true, secret false) with door:1', () => {
    const wall = { floor: 0, x1: 2, y1: 3, x2: 4, y2: 3, isDoor: true, doorId: 7 };
    const doorsById = new Map([[7, { id: 7, secret: false }]]);
    const data = buildWallData(wall, doorsById, gridSize);
    expect(data.door).toBe(1);
    expect(data.c).toEqual([200, 300, 400, 300]);
  });

  it('builds a secret door wall (isDoor true, secret true) with door:2', () => {
    const wall = { floor: 0, x1: 2, y1: 3, x2: 4, y2: 3, isDoor: true, doorId: 8 };
    const doorsById = new Map([[8, { id: 8, secret: true }]]);
    const data = buildWallData(wall, doorsById, gridSize);
    expect(data.door).toBe(2);
  });
});

describe('buildNoteData', () => {
  it('builds a Note referencing the given journal/page and centered on the area', () => {
    const area = { id: 3, label: '1-02', floor: 0, roomId: 5, cx: 10.5, cy: 8, exits: [] };
    const data = buildNoteData(area, 100, 'page123', 'journal456');
    expect(data).toEqual({
      entryId: 'journal456',
      pageId: 'page123',
      x: 1050,
      y: 800,
      text: '1-02',
      fontSize: 32,
      textAnchor: 0,
      texture: { src: 'icons/svg/village.svg' },
      iconSize: 60,
    });
  });
});
