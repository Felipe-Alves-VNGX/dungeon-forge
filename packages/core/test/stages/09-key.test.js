// packages/core/test/stages/09-key.test.js
import { describe, it, expect } from 'vitest';
import { buildKey, keyToMarkdown } from '../../src/stages/09-key.js';

function room(id, floor, cx, cy, role = 'filler') {
  return { id, floor, x: cx, y: cy, w: 1, h: 1, cx, cy, role, doors: [] };
}

const DEFAULT_KEY_CONFIG = {
  scheme: 'per-floor',
  numberJunctions: false,
  startAt: 1,
  padTo: 2,
  exitsInEntries: true,
};

describe('buildKey', () => {
  it('numbers every room via BFS from the entrance, ties broken by (y, then x)', () => {
    // entrance(0) at origin; two BFS-equal-distance neighbors 1 (y=0,x=1)
    // and 2 (y=-1,x=1) — 2 should win the tie (smaller y first).
    const rooms = [
      room(0, 0, 0, 0, 'entrance'),
      room(1, 0, 1, 0, 'filler'),
      room(2, 0, 1, -1, 'filler'),
    ];
    rooms[0].edges = undefined; // rooms don't carry edges; buildKey takes rooms + adjacency via exits computed elsewhere in real pipeline
    const adjacency = [
      { a: 0, b: 1 },
      { a: 0, b: 2 },
    ];
    const { areas, key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    const areaFor = (id) => areas.find((a) => a.roomId === id);
    expect(areaFor(0).label).toBe('1-01');
    expect(areaFor(2).label).toBe('1-02'); // y=-1 sorts before y=0
    expect(areaFor(1).label).toBe('1-03');
    expect(key.byLabel['1-01']).toBe(areaFor(0).id);
  });

  it('supports the flat scheme (no floor prefix)', () => {
    const rooms = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0)];
    const adjacency = [{ a: 0, b: 1 }];
    const { areas } = buildKey(rooms, adjacency, 0, { ...DEFAULT_KEY_CONFIG, scheme: 'flat' });
    const labels = areas.map((a) => a.label).sort();
    expect(labels).toEqual(['1', '2']);
  });

  it('supports the alpha-floor scheme', () => {
    const rooms = [
      room(0, 0, 0, 0, 'entrance'),
      room(1, 1, 1, 0),
    ];
    const adjacency = [{ a: 0, b: 1 }];
    const { areas } = buildKey(rooms, adjacency, 0, { ...DEFAULT_KEY_CONFIG, scheme: 'alpha-floor' });
    const areaFor = (id) => areas.find((a) => a.roomId === id);
    expect(areaFor(0).label).toBe('A1');
    expect(areaFor(1).label).toBe('B1');
  });

  it('generates a KeyEntry per area with role-appropriate title', () => {
    const rooms = [
      room(0, 0, 0, 0, 'entrance'),
      room(1, 0, 1, 0, 'climax'),
    ];
    const adjacency = [{ a: 0, b: 1 }];
    const { key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    expect(key.entries.find((e) => e.title === 'Entrada')).toBeTruthy();
    expect(key.entries.find((e) => e.title === 'Câmara final')).toBeTruthy();
  });

  it('legend only lists symbols actually present', () => {
    const rooms = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0, 'filler')];
    const adjacency = [{ a: 0, b: 1 }];
    const { key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    expect(key.legend.some((s) => s.kind === 'treasure')).toBe(false);
    expect(key.legend.some((s) => s.kind === 'entrance')).toBe(true);
  });

  it('is deterministic — same input, same output, no RNG parameter exists', () => {
    const rooms1 = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0)];
    const rooms2 = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0)];
    const adjacency = [{ a: 0, b: 1 }];
    const r1 = buildKey(rooms1, adjacency, 0, DEFAULT_KEY_CONFIG);
    const r2 = buildKey(rooms2, adjacency, 0, DEFAULT_KEY_CONFIG);
    expect(r1.areas.map((a) => a.label)).toEqual(r2.areas.map((a) => a.label));
  });

  it('numbers every room on the current floor before crossing a VerticalLink (§5.11)', () => {
    // floor0: 0(entrance) - 1 - 3, all same-floor. floor1: 2, reached only
    // via a VerticalLink from room 1. All of floor 0 must be numbered
    // before room 2 gets its number.
    const rooms = [
      room(0, 0, 0, 0, 'entrance'),
      room(1, 0, 1, 0, 'filler'),
      room(2, 1, 0, 0, 'filler'),
      room(3, 0, 2, 0, 'filler'),
    ];
    const adjacency = [{ a: 0, b: 1 }, { a: 1, b: 3 }];
    const links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 0, y: 0, w: 2, h: 1, kind: 'stair', roomIdFrom: 1, roomIdTo: 2 }];

    const { areas } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG, links);
    const areaFor = (id) => areas.find((a) => a.roomId === id);

    expect(areaFor(0).label).toBe('1-01');
    expect(areaFor(1).label).toBe('1-02');
    expect(areaFor(3).label).toBe('1-03');
    expect(areaFor(2).label).toBe('2-01');
  });

  it('legend includes stairUp/stairDown iff links exist', () => {
    const rooms = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0, 'filler'), room(2, 1, 0, 0, 'filler')];
    const adjacency = [{ a: 0, b: 1 }];

    const withoutLinks = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    expect(withoutLinks.key.legend.some((s) => s.kind === 'stairUp')).toBe(false);
    expect(withoutLinks.key.legend.some((s) => s.kind === 'stairDown')).toBe(false);

    const links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 0, y: 0, w: 2, h: 1, kind: 'stair', roomIdFrom: 1, roomIdTo: 2 }];
    const withLinks = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG, links);
    expect(withLinks.key.legend.some((s) => s.kind === 'stairUp')).toBe(true);
    expect(withLinks.key.legend.some((s) => s.kind === 'stairDown')).toBe(true);
  });

  it('lists a stair exit on both ends of a VerticalLink with the right destination label', () => {
    const rooms = [
      room(0, 0, 0, 0, 'entrance'),
      room(1, 0, 1, 0, 'filler'),
      room(2, 1, 0, 0, 'filler'),
    ];
    const adjacency = [{ a: 0, b: 1 }];
    const links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 0, y: 0, w: 2, h: 1, kind: 'stair', roomIdFrom: 1, roomIdTo: 2 }];

    const { areas } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG, links);
    const areaFor = (id) => areas.find((a) => a.roomId === id);

    expect(areaFor(1).exits).toContainEqual({ dir: 'down', toLabel: areaFor(2).label, via: 'stair' });
    expect(areaFor(2).exits).toContainEqual({ dir: 'up', toLabel: areaFor(1).label, via: 'stair' });
  });

  it('legend includes secret iff a door is secret, and mentions it in the treasure room description', () => {
    const treasureRoomObj = room(1, 0, 1, 0, 'treasure');
    treasureRoomObj.doors = [100, 101];
    const rooms = [room(0, 0, 0, 0, 'entrance'), treasureRoomObj];
    const adjacency = [{ a: 0, b: 1 }];
    const doors = [
      { id: 100, floor: 0, x1: 0, y1: 0, x2: 1, y2: 0, roomId: 1, secret: false },
      { id: 101, floor: 0, x1: 0, y1: 0, x2: 1, y2: 0, roomId: 1, secret: true },
    ];

    const withoutDoors = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    expect(withoutDoors.key.legend.some((s) => s.kind === 'secret')).toBe(false);

    const { key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG, [], doors);
    expect(key.legend.some((s) => s.kind === 'secret')).toBe(true);
    const treasureEntry = key.entries.find((e) => e.tags.includes('treasure'));
    expect(treasureEntry.description).toContain('secreta');
  });
});

describe('keyToMarkdown', () => {
  it('produces a heading per floor and a section per area', () => {
    const rooms = [room(0, 0, 0, 0, 'entrance'), room(1, 0, 1, 0)];
    const adjacency = [{ a: 0, b: 1 }];
    const { areas, key } = buildKey(rooms, adjacency, 0, DEFAULT_KEY_CONFIG);
    const md = keyToMarkdown(areas, key);
    expect(md).toContain('# ');
    expect(md).toContain('1-01');
    expect(md).toContain('1-02');
  });
});
