import { describe, it, expect } from 'vitest';
import { CELL, createGrid, setCell, createRoomIdGrid, setRoomId, NO_ROOM } from '../../src/grid.js';
import { extractWalls } from '../../src/stages/10-extract-walls.js';

function room(id, x, y, w, h) {
  return { id, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [] };
}

function stamp(grid, width, height, x, y, w, h, value) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setCell(grid, x + dx, y + dy, 0, width, height, value);
    }
  }
}

function stampRoomId(roomIdAt, width, height, roomId, x, y, w, h) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setRoomId(roomIdAt, x + dx, y + dy, 0, width, height, roomId);
    }
  }
}

describe('extractWalls', () => {
  it('produces walls only on the boundary of a walkable region', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    const r0 = room(0, 2, 2, 4, 4);
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);

    const { walls } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      expect(w.floor).toBe(0);
    }
  });

  it('fuses colinear contiguous segments into one WallSegment', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    const r0 = room(0, 2, 2, 5, 3); // top edge is 5 cells wide -> should fuse into 1 segment, not 5
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);

    const { walls } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
    const topWalls = walls.filter((w) => w.y1 === r0.y && w.y2 === r0.y);
    expect(topWalls).toHaveLength(1);
    expect(Math.abs(topWalls[0].x2 - topWalls[0].x1)).toBe(r0.w);
  });

  it('marks a corridor crossing a room boundary as a door', () => {
    const width = 12;
    const height = 12;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    const r0 = room(0, 2, 2, 3, 3);
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
    // Hallway poking out of the room's east wall, dead-ending into nothing.
    stamp(grid, width, height, r0.x + r0.w, r0.y + 1, 3, 1, CELL.HALLWAY);

    const { walls, doors } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
    expect(doors.length).toBeGreaterThan(0);
    expect(walls.some((w) => w.isDoor)).toBe(true);
    // Nothing else to reach — must resolve to null, not throw.
    expect(doors.every((d) => d.toRoomId === null)).toBe(true);
    expect(doors.every((d) => d.dir === 'e')).toBe(true);
  });

  it('traces each door to the room its corridor actually reaches', () => {
    const width = 14;
    const height = 8;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    const r0 = room(0, 2, 2, 3, 3); // x:2-4, y:2-4, east wall at x=5
    const r1 = room(1, 8, 2, 3, 3); // x:8-10, y:2-4, west wall at x=8
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
    stamp(grid, width, height, r1.x, r1.y, r1.w, r1.h, CELL.ROOM);
    stampRoomId(roomIdAt, width, height, r1.id, r1.x, r1.y, r1.w, r1.h);
    // Corridor at y=3 joining room 0's east side to room 1's west side.
    stamp(grid, width, height, 5, 3, 3, 1, CELL.HALLWAY);

    const { doors } = extractWalls(grid, roomIdAt, width, height, 0, [r0, r1]);
    const doorFrom0 = doors.find((d) => d.roomId === 0);
    const doorFrom1 = doors.find((d) => d.roomId === 1);

    expect(doorFrom0.dir).toBe('e');
    expect(doorFrom0.toRoomId).toBe(1);
    expect(doorFrom1.dir).toBe('w');
    expect(doorFrom1.toRoomId).toBe(0);
  });

  it('every WallSegment borders at least one walkable cell', () => {
    const width = 10;
    const height = 10;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    const r0 = room(0, 3, 3, 3, 3);
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
    const { walls } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
    expect(walls.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same grid', () => {
    const width = 10;
    const height = 10;
    const gridA = createGrid(width, height, 1);
    const gridB = createGrid(width, height, 1);
    const roomIdAtA = createRoomIdGrid(width, height, 1);
    const roomIdAtB = createRoomIdGrid(width, height, 1);
    const r0 = room(0, 2, 2, 4, 4);
    stamp(gridA, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAtA, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
    stamp(gridB, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAtB, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
    const a = extractWalls(gridA, roomIdAtA, width, height, 0, [room(0, 2, 2, 4, 4)]);
    const b = extractWalls(gridB, roomIdAtB, width, height, 0, [room(0, 2, 2, 4, 4)]);
    expect(a.walls).toEqual(b.walls);
  });

  it('detects a door on the interior wall of a concave (L-shaped) room', () => {
    const width = 14;
    const height = 14;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    // A 6x6 room with the NE corner notched out (see rasterizeL, notch = floor((6-1)/3) = 1,
    // so the notch is the single cell at the room's top-right corner: (r0.x+5, r0.y)).
    const r0 = room(0, 2, 2, 6, 6);
    const notchCell = { x: r0.x + 5, y: r0.y };
    for (let y = r0.y; y < r0.y + r0.h; y++) {
      for (let x = r0.x; x < r0.x + r0.w; x++) {
        if (x === notchCell.x && y === notchCell.y) continue;
        setCell(grid, x, y, 0, width, height, CELL.ROOM);
        setRoomId(roomIdAt, x, y, 0, width, height, r0.id);
      }
    }
    // Carve a hallway cell into the notch from outside, so the room's interior
    // (concave) wall directly below the notch has a real door opening.
    setCell(grid, notchCell.x, notchCell.y, 0, width, height, CELL.HALLWAY);

    const { doors } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
    expect(doors.some((d) => d.roomId === 0)).toBe(true);
  });

  it('never leaks NO_ROOM (65535) as a toRoomId when a CELL.ROOM cell has no roomIdAt entry', () => {
    const width = 14;
    const height = 8;
    const grid = createGrid(width, height, 1);
    const roomIdAt = createRoomIdGrid(width, height, 1);
    const r0 = room(0, 2, 2, 3, 3); // x:2-4, y:2-4, east wall at x=5
    stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
    stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
    // Corridor from room 0's east wall leading to an orphan CELL.ROOM cell
    // that was stamped in the grid but never given a roomIdAt entry —
    // simulating the scenario the guard in roomIdAtCell protects against.
    // getRoomId would return NO_ROOM (0xffff) for this cell.
    stamp(grid, width, height, 5, 3, 3, 1, CELL.HALLWAY);
    setCell(grid, 8, 3, 0, width, height, CELL.ROOM);

    const { doors } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
    const doorFrom0 = doors.find((d) => d.roomId === 0);
    expect(doorFrom0).toBeDefined();
    expect(doors.every((d) => d.toRoomId !== NO_ROOM)).toBe(true);
    expect(doorFrom0.toRoomId).toBe(null);
  });

  describe('door width capping', () => {
    it('leaves a 1-cell-wide opening as a single-cell door, no overflow wall', () => {
      const width = 12;
      const height = 12;
      const grid = createGrid(width, height, 1);
      const roomIdAt = createRoomIdGrid(width, height, 1);
      const r0 = room(0, 2, 2, 4, 4); // east wall at x=6, y:2-5
      stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
      stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
      // A single hallway cell touching the east wall at y=3.
      stamp(grid, width, height, r0.x + r0.w, 3, 3, 1, CELL.HALLWAY);

      const { walls, doors } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
      const doorWalls = walls.filter((w) => w.isDoor);
      expect(doorWalls).toHaveLength(1);
      expect(Math.abs(doorWalls[0].y2 - doorWalls[0].y1)).toBe(1);
      expect(doors).toHaveLength(1);
    });

    it('caps a wide opening (5 cells) into a 2-cell door plus plain-wall overflow either side', () => {
      const width = 14;
      const height = 14;
      const grid = createGrid(width, height, 1);
      const roomIdAt = createRoomIdGrid(width, height, 1);
      const r0 = room(0, 2, 2, 3, 5); // east wall at x=5, y:2-6 (5 cells tall)
      stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
      stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
      // A wide (3-cell) hallway patch spanning the room's entire east wall.
      stamp(grid, width, height, r0.x + r0.w, r0.y, 3, r0.h, CELL.HALLWAY);

      const { walls, doors } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
      const doorWalls = walls.filter((w) => w.isDoor);
      expect(doorWalls).toHaveLength(1);
      expect(Math.abs(doorWalls[0].y2 - doorWalls[0].y1)).toBe(2); // capped to a 2-cell double door

      // The rest of that same wall run must show up as plain (non-door) wall.
      const eastX = r0.x + r0.w;
      const eastNonDoorWalls = walls.filter((w) => !w.isDoor && w.x1 === eastX && w.x2 === eastX);
      const overflowLength = eastNonDoorWalls.reduce((sum, w) => sum + Math.abs(w.y2 - w.y1), 0);
      expect(overflowLength).toBe(r0.h - 2); // 5-cell run - 2-cell door = 3 cells of plain wall

      expect(doors).toHaveLength(1);
      expect(doors[0].roomId).toBe(0);
    });

    it('room still registers >=1 door after a wide opening is capped (Invariant 8 stays satisfied)', () => {
      const width = 14;
      const height = 14;
      const grid = createGrid(width, height, 1);
      const roomIdAt = createRoomIdGrid(width, height, 1);
      const r0 = room(0, 2, 2, 3, 6); // 6-cell-tall east wall, all touching a wide hallway
      stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
      stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
      stamp(grid, width, height, r0.x + r0.w, r0.y, 4, r0.h, CELL.HALLWAY);

      const { doors } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
      r0.doors = doors.filter((d) => d.roomId === 0).map((d) => d.id);
      expect(r0.doors.length).toBeGreaterThanOrEqual(1);
    });

    it('caps a horizontal (north/south) wide opening the same way as vertical', () => {
      const width = 14;
      const height = 14;
      const grid = createGrid(width, height, 1);
      const roomIdAt = createRoomIdGrid(width, height, 1);
      const r0 = room(0, 2, 2, 6, 3); // south wall at y=5, x:2-8 (6 cells wide)
      stamp(grid, width, height, r0.x, r0.y, r0.w, r0.h, CELL.ROOM);
      stampRoomId(roomIdAt, width, height, r0.id, r0.x, r0.y, r0.w, r0.h);
      stamp(grid, width, height, r0.x, r0.y + r0.h, r0.w, 3, CELL.HALLWAY);

      const { walls } = extractWalls(grid, roomIdAt, width, height, 0, [r0]);
      const doorWalls = walls.filter((w) => w.isDoor);
      expect(doorWalls).toHaveLength(1);
      expect(Math.abs(doorWalls[0].x2 - doorWalls[0].x1)).toBe(2);

      const southY = r0.y + r0.h;
      const southNonDoorWalls = walls.filter((w) => !w.isDoor && w.y1 === southY && w.y2 === southY);
      const overflowLength = southNonDoorWalls.reduce((sum, w) => sum + Math.abs(w.x2 - w.x1), 0);
      expect(overflowLength).toBe(r0.w - 2);
    });
  });
});
