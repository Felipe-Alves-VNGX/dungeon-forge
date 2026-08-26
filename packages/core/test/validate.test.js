// packages/core/test/validate.test.js
import { describe, it, expect } from 'vitest';
import { validateDungeon } from '../src/validate.js';
import { generateDungeon } from '../src/pipeline.js';
import { CELL, createGrid, setCell } from '../src/grid.js';

// A single 3x3 room at (2,2)-(5,5) with a 1-wide door + hallway stub on its
// east side, on an 8x8x1 grid — enough real geometry to exercise the
// wall/door/anchor checks without needing a full generateDungeon() run.
function baseDungeon() {
  const width = 8;
  const height = 8;
  const floors = 1;
  const cells = createGrid(width, height, floors);
  for (let y = 2; y < 5; y++) {
    for (let x = 2; x < 5; x++) setCell(cells, x, y, 0, width, height, CELL.ROOM);
  }
  setCell(cells, 5, 3, 0, width, height, CELL.HALLWAY);

  const room = { id: 0, floor: 0, x: 2, y: 2, w: 3, h: 3, cx: 3.5, cy: 3.5, role: 'entrance', doors: [0] };
  // The hallway stub sits at row y=3 (outside the room's east edge), so the
  // door — and the wall stubs flanking it — must align with that same row.
  const door = { id: 0, floor: 0, x1: 5, y1: 3, x2: 5, y2: 4, roomId: 0, secret: false };
  const walls = [
    { floor: 0, x1: 2, y1: 2, x2: 5, y2: 2, isDoor: false, doorId: null },
    { floor: 0, x1: 2, y1: 2, x2: 2, y2: 5, isDoor: false, doorId: null },
    { floor: 0, x1: 2, y1: 5, x2: 5, y2: 5, isDoor: false, doorId: null },
    { floor: 0, x1: 5, y1: 2, x2: 5, y2: 3, isDoor: false, doorId: null },
    { floor: 0, x1: 5, y1: 4, x2: 5, y2: 5, isDoor: false, doorId: null },
    { floor: 0, x1: 5, y1: 3, x2: 5, y2: 4, isDoor: true, doorId: 0 },
  ];
  const area = { id: 0, label: '1-01', floor: 0, roomId: 0, cx: 3.5, cy: 3.5, exits: [] };
  const key = {
    scheme: 'per-floor',
    entries: [{ areaId: 0, label: '1-01', title: 'Entrada', description: '', tags: ['entrance'] }],
    legend: [
      { kind: 'entrance', caption: 'Entrada da masmorra' },
      { kind: 'area', caption: 'Área sem papel especial' },
    ],
    byLabel: { '1-01': 0 },
  };

  return {
    config: { seed: 'base', floors, width, height, key: { startAt: 1 } },
    seed: 'base',
    width,
    height,
    floors,
    cells,
    rooms: [room],
    edges: [],
    links: [],
    doors: [door],
    walls,
    mission: { entranceRoomId: 0, climaxRoomId: 0, path: [0], criticalLinks: [], optionalBranches: [] },
    areas: [area],
    key,
  };
}

describe('validateDungeon', () => {
  it('accepts a well-formed single-room Dungeon', () => {
    const { ok, errors } = validateDungeon(baseDungeon());
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('flags a walkable cell unreachable from the rest of the floor', () => {
    const d = baseDungeon();
    setCell(d.cells, 7, 7, 0, d.width, d.height, CELL.HALLWAY);
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'floor-disconnected')).toBe(true);
  });

  it('flags a VerticalLink footprint that is not CELL.STAIR', () => {
    const d = baseDungeon();
    d.links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 0, y: 0, w: 2, h: 1, kind: 'stair' }];
    d.floors = 2;
    d.cells = createGrid(d.width, d.height, 2);
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'link-footprint-not-stair')).toBe(true);
  });

  it('accepts two VerticalLinks whose STAIR footprints touch each other', () => {
    // Regression: a link's footprint can be adjacent only to a *different*
    // link's STAIR footprint (stage 5 only separates links within the same
    // floor gap) — that's still genuinely walkable and must not be flagged.
    const width = 6;
    const height = 6;
    const floors = 2;
    const cells = createGrid(width, height, floors);
    setCell(cells, 1, 1, 0, width, height, CELL.STAIR);
    setCell(cells, 1, 1, 1, width, height, CELL.STAIR);
    setCell(cells, 1, 2, 0, width, height, CELL.STAIR);
    setCell(cells, 1, 2, 1, width, height, CELL.STAIR);
    setCell(cells, 1, 0, 0, width, height, CELL.HALLWAY);
    setCell(cells, 1, 0, 1, width, height, CELL.HALLWAY);
    setCell(cells, 1, 3, 0, width, height, CELL.HALLWAY);
    setCell(cells, 1, 3, 1, width, height, CELL.HALLWAY);

    const links = [
      { id: 0, fromFloor: 0, toFloor: 1, x: 1, y: 1, w: 1, h: 1, kind: 'stair' },
      { id: 1, fromFloor: 0, toFloor: 1, x: 1, y: 2, w: 1, h: 1, kind: 'stair' },
    ];

    const d = {
      config: { seed: 'x', floors, width, height, key: { startAt: 1 } },
      seed: 'x', width, height, floors, cells,
      rooms: [], edges: [], links, doors: [], walls: [],
      mission: { entranceRoomId: 0, climaxRoomId: 0, path: [], criticalLinks: [], optionalBranches: [] },
      areas: [], key: { scheme: 'per-floor', entries: [], legend: [], byLabel: {} },
    };
    const { errors } = validateDungeon(d);
    expect(errors.some((e) => e.code === 'link-inaccessible')).toBe(false);
  });

  it('flags a door that is not walkable on both sides', () => {
    const d = baseDungeon();
    d.doors = [{ id: 0, floor: 0, x1: 0, y1: 0, x2: 0, y2: 1, roomId: 0, secret: false }];
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'door-not-open-both-sides')).toBe(true);
  });

  it('flags a WallSegment bordering no walkable cell', () => {
    const d = baseDungeon();
    d.walls = [...d.walls, { floor: 0, x1: 0, y1: 0, x2: 1, y2: 0, isDoor: false, doorId: null }];
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'orphan-wall')).toBe(true);
  });

  it('flags an accidental hallway dead end with no adjacent content', () => {
    const d = baseDungeon();
    // Extend the existing (protected, room-adjacent) hallway stub two cells
    // further out: (7,3) ends up with exactly one walkable neighbor, (6,3),
    // which is itself neither ROOM nor STAIR — an unprotected dead end.
    setCell(d.cells, 6, 3, 0, d.width, d.height, CELL.HALLWAY);
    setCell(d.cells, 7, 3, 0, d.width, d.height, CELL.HALLWAY);
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'orphan-dead-end')).toBe(true);
  });

  it('flags walls.length over the 1500 budget', () => {
    const d = baseDungeon();
    d.walls = Array.from({ length: 1500 }, (_, i) => ({ floor: 0, x1: 2, y1: 2, x2: 5, y2: 2, isDoor: false, doorId: null }));
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'wall-budget-exceeded')).toBe(true);
  });

  it('flags a Room with no doors', () => {
    const d = baseDungeon();
    d.rooms[0].doors = [];
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'room-unreachable')).toBe(true);
  });

  it('flags a Room with no matching Area', () => {
    const d = baseDungeon();
    d.areas = [];
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'room-area-mismatch')).toBe(true);
  });

  it('flags an Area with no matching KeyEntry', () => {
    const d = baseDungeon();
    d.key.entries = [];
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'area-entry-mismatch')).toBe(true);
  });

  it('flags duplicate labels', () => {
    const d = baseDungeon();
    d.areas.push({ id: 1, label: '1-01', floor: 0, roomId: null, cx: 3.5, cy: 3.5, exits: [] });
    d.key.entries.push({ areaId: 1, label: '1-01', title: 'x', description: '', tags: [] });
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'duplicate-label')).toBe(true);
  });

  it('flags a gap in per-floor numbering', () => {
    const d = baseDungeon();
    d.areas[0].label = '1-03';
    d.key.entries[0].label = '1-03';
    d.key.byLabel = { '1-03': 0 };
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'label-numbering-gap')).toBe(true);
  });

  it('flags an exit that is not reciprocated', () => {
    const d = baseDungeon();
    d.areas.push({ id: 1, label: '1-02', floor: 0, roomId: null, cx: 3.5, cy: 3.5, exits: [] });
    d.key.entries.push({ areaId: 1, label: '1-02', title: 'x', description: '', tags: [] });
    d.areas[0].exits = [{ dir: 'n', toLabel: '1-02', via: 'door' }];
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'exit-not-symmetric')).toBe(true);
  });

  it('flags an area anchor that does not land on a walkable cell', () => {
    const d = baseDungeon();
    d.areas[0].cx = 0;
    d.areas[0].cy = 0;
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'anchor-not-walkable')).toBe(true);
  });

  it('flags an area anchor too close to a wall', () => {
    const d = baseDungeon();
    d.areas[0].cx = 2.1;
    d.areas[0].cy = 3.5;
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'anchor-too-close-to-wall')).toBe(true);
  });

  it('flags a legend symbol whose role is not present among rooms', () => {
    const d = baseDungeon();
    d.key.legend.push({ kind: 'climax', caption: 'Câmara final' });
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'legend-symbol-unused')).toBe(true);
  });

  it('flags a role present with no legend symbol', () => {
    const d = baseDungeon();
    d.key.legend = d.key.legend.filter((s) => s.kind !== 'entrance');
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'legend-missing-symbol')).toBe(true);
  });

  it('flags a legend with no stairUp/stairDown when links exist (SPEC.md §5.11)', () => {
    const d = baseDungeon();
    d.links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 0, y: 0, w: 2, h: 1, kind: 'stair' }];
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.filter((e) => e.code === 'legend-missing-symbol' && (e.kind === 'stairUp' || e.kind === 'stairDown'))).toHaveLength(2);
  });

  it('flags a legend declaring stairUp/stairDown when there are no links', () => {
    const d = baseDungeon();
    d.key.legend.push({ kind: 'stairUp', caption: 'Escada subindo' }, { kind: 'stairDown', caption: 'Escada descendo' });
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.filter((e) => e.code === 'legend-symbol-unused' && (e.kind === 'stairUp' || e.kind === 'stairDown'))).toHaveLength(2);
  });

  it('flags areas.length + links.length*2 over the 60 note budget', () => {
    const d = baseDungeon();
    d.links = Array.from({ length: 30 }, (_, i) => ({ id: i, fromFloor: 0, toFloor: 1, x: 0, y: 0, w: 1, h: 1, kind: 'stair' }));
    const { ok, errors } = validateDungeon(d);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.code === 'note-budget-exceeded')).toBe(true);
  });
});

describe('validateDungeon — full pipeline output', () => {
  const CONFIG = {
    seed: 'validate-pipeline',
    floors: 1,
    width: 50,
    height: 50,
    rooms: { count: 9, sizeMean: 7, sizeStdDev: 2.5, sizeMin: 3, sizeMax: 14, spawnRadius: 18, separationIters: 60 },
    cycleRate: 0.25,
    verticalLinksPerGap: 2,
    carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
    pruneIterations: 8,
    key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
  };

  it('a single-floor dungeon passes every invariant', () => {
    const { ok, errors } = validateDungeon(generateDungeon(CONFIG));
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('a multi-floor dungeon passes every invariant', () => {
    const dungeon = generateDungeon({ ...CONFIG, seed: 'validate-multi', floors: 3 });
    const { ok, errors } = validateDungeon(dungeon);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });
});
