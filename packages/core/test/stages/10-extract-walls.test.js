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
});
