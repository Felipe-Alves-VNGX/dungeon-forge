import { describe, it, expect } from 'vitest';
import { mission } from '../../src/stages/08-mission.js';

function room(id, cx, cy) {
  return { id, floor: 0, x: cx, y: cy, w: 1, h: 1, cx, cy, role: 'filler', doors: [] };
}

describe('mission', () => {
  it('marks exactly one entrance and one climax on a simple chain', () => {
    // 0 - 1 - 2 - 3, a straight MST chain: both leaves (0, 3) are candidates.
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0), room(3, 3, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 2, b: 3, weight: 1, kind: 'mst' },
    ];
    const result = mission(rooms, edges);
    const entrances = rooms.filter((r) => r.role === 'entrance');
    const climaxes = rooms.filter((r) => r.role === 'climax');
    expect(entrances).toHaveLength(1);
    expect(climaxes).toHaveLength(1);
    expect(result.entranceRoomId).toBe(entrances[0].id);
    expect(result.climaxRoomId).toBe(climaxes[0].id);
  });

  it('entrance and climax are never the same room', () => {
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
    ];
    const result = mission(rooms, edges);
    expect(result.entranceRoomId).not.toBe(result.climaxRoomId);
  });

  it('marks rooms reachable only via a cycle edge as treasure', () => {
    // 0-1-2 is the MST chain; 0-2 is a cycle edge, making room 2 reachable
    // by both the chain and the cycle, but a room hanging *only* off the
    // cycle edge (room 3, linked only to 2 via cycle) should be treasure.
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0), room(3, 3, 3)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 2, b: 3, weight: 1, kind: 'cycle' },
    ];
    mission(rooms, edges);
    const room3 = rooms.find((r) => r.id === 3);
    expect(room3.role).toBe('treasure');
  });

  it('marks degree >=3 rooms as junction (when not entrance/climax/treasure)', () => {
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 1), room(3, 2, -1), room(4, 3, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 1, b: 3, weight: 1, kind: 'mst' },
      { a: 1, b: 4, weight: 1, kind: 'mst' },
    ];
    mission(rooms, edges);
    const hub = rooms.find((r) => r.id === 1);
    expect(hub.role).toBe('junction');
  });

  it('path connects entrance to climax through the graph', () => {
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0), room(3, 3, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 2, b: 3, weight: 1, kind: 'mst' },
    ];
    const result = mission(rooms, edges);
    expect(result.path[0]).toBe(result.entranceRoomId);
    expect(result.path[result.path.length - 1]).toBe(result.climaxRoomId);
  });

  it('never leaves a leaf (degree-1) room with role filler', () => {
    // A star: hub 0 connects to four leaves (1,2,3,4). Two of them become
    // entrance/climax; the other two have no cycle edge, so under the old
    // role table they'd fall through to 'filler' despite being dead ends.
    const rooms = [room(0, 0, 0), room(1, 1, 1), room(2, -1, 1), room(3, 1, -1), room(4, -1, -1)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 0, b: 2, weight: 1, kind: 'mst' },
      { a: 0, b: 3, weight: 1, kind: 'mst' },
      { a: 0, b: 4, weight: 1, kind: 'mst' },
    ];
    mission(rooms, edges);
    const degree = new Map(rooms.map((r) => [r.id, 0]));
    for (const e of edges) {
      degree.set(e.a, degree.get(e.a) + 1);
      degree.set(e.b, degree.get(e.b) + 1);
    }
    for (const r of rooms) {
      if (degree.get(r.id) === 1) {
        expect(r.role).not.toBe('filler');
      }
    }
  });

  it('is deterministic (mission takes no RNG)', () => {
    const rooms1 = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0)];
    const rooms2 = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
    ];
    const r1 = mission(rooms1, edges);
    const r2 = mission(rooms2, edges);
    expect(r1.entranceRoomId).toBe(r2.entranceRoomId);
    expect(r1.climaxRoomId).toBe(r2.climaxRoomId);
  });
});
