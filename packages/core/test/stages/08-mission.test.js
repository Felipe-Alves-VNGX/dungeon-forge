import { describe, it, expect } from 'vitest';
import { mission, assignSecretDoors } from '../../src/stages/08-mission.js';

function room(id, cx, cy, floor = 0) {
  return { id, floor, x: cx, y: cy, w: 1, h: 1, cx, cy, role: 'filler', doors: [] };
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

  it('marks a structural dead end with a bonus cycle edge as treasure', () => {
    // spanningTree() always spans every room, so every room has >=1
    // non-cycle edge — a room can never be treasure by "reachable ONLY via
    // a cycle edge" taken literally. The achievable analogue: a dead end of
    // the structural (mst+vertical) graph that also picked up a cycle edge,
    // giving it exactly one bonus/alternate route in.
    // Chain 0-1-2-3 (room 3 a plain leaf, no cycle edge — must NOT be
    // treasure); room 4 hangs off room 2 by a single mst edge (a structural
    // leaf) and also gets a cycle edge back to room 0 (its bonus route).
    const rooms = [room(0, 0, 0), room(1, 1, 0), room(2, 2, 0), room(3, 3, 0), room(4, 2, 2)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'mst' },
      { a: 2, b: 3, weight: 1, kind: 'mst' },
      { a: 2, b: 4, weight: 1, kind: 'mst' },
      { a: 0, b: 4, weight: 1, kind: 'cycle' },
    ];
    mission(rooms, edges);
    expect(rooms.find((r) => r.id === 4).role).toBe('treasure');
    // A plain mst-only leaf (no cycle edge) is a dead end but not "optional
    // via a bonus route" — it must not be misdetected as treasure.
    expect(rooms.find((r) => r.id === 3).role).not.toBe('treasure');
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

  it('a leaf only reachable via a vertical edge is not misdetected as treasure', () => {
    // floor0: 0 - 1 (mst). floor1: 1 =(vertical)= 2, room 2 a leaf.
    // Room 2 is reachable from the entrance only by crossing the vertical
    // edge — it must NOT be flagged treasure just because there's no
    // 'mst'-kind path to it (only 'cycle'-only reachability should count).
    const rooms = [room(0, 0, 0, 0), room(1, 1, 0, 0), room(2, 0, 0, 1)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'vertical' },
    ];
    const links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 0, y: 0, w: 2, h: 1, kind: 'stair', roomIdFrom: 1, roomIdTo: 2 }];
    mission(rooms, edges, links);
    expect(rooms.find((r) => r.id === 2).role).not.toBe('treasure');
  });

  it('computes criticalLinks for VerticalLinks on the entrance-to-climax path', () => {
    const rooms = [room(0, 0, 0, 0), room(1, 1, 0, 0), room(2, 0, 0, 1), room(3, 1, 0, 1)];
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'vertical' },
      { a: 2, b: 3, weight: 1, kind: 'mst' },
    ];
    const links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 0, y: 0, w: 2, h: 1, kind: 'stair', roomIdFrom: 1, roomIdTo: 2 }];
    const result = mission(rooms, edges, links);
    expect(result.entranceRoomId).toBe(0);
    expect(result.climaxRoomId).toBe(3);
    expect(result.criticalLinks).toEqual([0]);
  });
});

describe('assignSecretDoors', () => {
  function treasureRoom(id, doorIds) {
    return { id, floor: 0, x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0, role: 'treasure', doors: doorIds };
  }
  function door(id, secret = false) {
    return { id, floor: 0, x1: 0, y1: 0, x2: 1, y2: 0, roomId: 0, secret };
  }

  it('marks exactly one door secret on a treasure room with >=2 doors', () => {
    const rooms = [treasureRoom(0, [10, 11])];
    const doors = [door(10), door(11)];
    assignSecretDoors(rooms, doors);
    const secretCount = doors.filter((d) => d.secret).length;
    expect(secretCount).toBe(1);
    // The room's discoverable side must survive: not every door is secret.
    expect(doors.some((d) => !d.secret)).toBe(true);
  });

  it('leaves a treasure room with only one door untouched (must stay discoverable)', () => {
    const rooms = [treasureRoom(0, [10])];
    const doors = [door(10)];
    assignSecretDoors(rooms, doors);
    expect(doors[0].secret).toBe(false);
  });

  it('never marks doors secret on non-treasure rooms', () => {
    const rooms = [{ id: 0, floor: 0, x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0, role: 'junction', doors: [10, 11] }];
    const doors = [door(10), door(11)];
    assignSecretDoors(rooms, doors);
    expect(doors.every((d) => !d.secret)).toBe(true);
  });
});
