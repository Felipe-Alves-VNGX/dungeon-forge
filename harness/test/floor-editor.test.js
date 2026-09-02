import { describe, it, expect } from 'vitest';
import { generateDungeon } from '@dungeon-forge/core';
import { buildFloorEditorSVG } from '../src/floor-editor.js';

const CONFIG = {
  seed: 'floor-editor-test',
  floors: 1, width: 40, height: 40,
  rooms: {
    count: 4, sizeMean: 6, sizeStdDev: 1, sizeMin: 4, sizeMax: 8, spawnRadius: 14, separationIters: 40,
    shapes: [{ type: 'l', weight: 1 }],
  },
  cycleRate: 0.15, verticalLinksPerGap: 2,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: { scheme: 'flat', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

describe('buildFloorEditorSVG', () => {
  it('draws one cell rect per room cell, not one rect per room', () => {
    const dungeon = generateDungeon(CONFIG);
    const svg = buildFloorEditorSVG(dungeon, 0, 20);
    const roomsOnFloor = dungeon.rooms.filter((r) => r.floor === 0);
    const matches = svg.match(/class="edit-room-cell"/g) ?? [];
    // Every room in this config is forced non-'rect' with a real notch (sizeMin 4+),
    // so the total cell count must be strictly less than the naive bbox sum.
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(roomsOnFloor.reduce((sum, r) => sum + r.w * r.h, 0));
  });

  it('still wraps each room\'s cells in one editable-room group per room', () => {
    const dungeon = generateDungeon(CONFIG);
    const svg = buildFloorEditorSVG(dungeon, 0, 20);
    const roomsOnFloor = dungeon.rooms.filter((r) => r.floor === 0);
    const groups = svg.match(/class="editable-room"/g) ?? [];
    expect(groups).toHaveLength(roomsOnFloor.length);
  });
});
