// packages/adapter-foundry/test/shared/geometry.test.js
import { describe, it, expect } from 'vitest';
import { toPixel, buildWallData, buildNoteData, buildStairNoteData } from '../../src/shared/geometry.js';
import { iconForRole } from '../../src/shared/icons.js';

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
  it('builds a Note referencing the given journal/page, centered on the area, with the role icon', () => {
    const area = { id: 3, label: '1-02', floor: 0, roomId: 5, cx: 10.5, cy: 8, exits: [] };
    const data = buildNoteData(area, 100, 'page123', 'journal456', 'treasure');
    expect(data).toEqual({
      entryId: 'journal456',
      pageId: 'page123',
      x: 1050,
      y: 800,
      text: '1-02',
      fontSize: 32,
      textAnchor: 0,
      texture: { src: iconForRole('treasure') },
      iconSize: 60,
    });
  });
});

describe('buildStairNoteData', () => {
  it('builds a Note pointing down to the destination area on the fromFloor side', () => {
    const link = { id: 0, fromFloor: 0, toFloor: 1, x: 5, y: 5, w: 2, h: 1, kind: 'stair', roomIdFrom: 0, roomIdTo: 1 };
    const destinationArea = { id: 1, label: '2-01', floor: 1, roomId: 1, cx: 8, cy: 8, exits: [] };
    const data = buildStairNoteData(link, 0, destinationArea, 100, 'page-1', 'journal-1');
    expect(data.text).toBe('↓ 2-01');
    expect(data.x).toBe(600); // (5 + 2/2) * 100
    expect(data.y).toBe(550); // (5 + 1/2) * 100
    expect(data.pageId).toBe('page-1');
    expect(data.entryId).toBe('journal-1');
  });

  it('builds a Note pointing up to the destination area on the toFloor side', () => {
    const link = { id: 0, fromFloor: 0, toFloor: 1, x: 5, y: 5, w: 2, h: 1, kind: 'stair', roomIdFrom: 0, roomIdTo: 1 };
    const destinationArea = { id: 0, label: '1-01', floor: 0, roomId: 0, cx: 6, cy: 6, exits: [] };
    const data = buildStairNoteData(link, 1, destinationArea, 100, 'page-0', 'journal-1');
    expect(data.text).toBe('↑ 1-01');
  });
});
