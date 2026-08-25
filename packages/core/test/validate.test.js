// packages/core/test/validate.test.js
import { describe, it, expect } from 'vitest';
import { validateDungeon } from '../src/validate.js';
import { generateDungeon } from '../src/pipeline.js';
import { CELL, createGrid, setCell } from '../src/grid.js';

function hasRule(errors, rule) {
  return errors.some((e) => e.rule === rule);
}

describe('validateDungeon — rule 1 (per-floor connectivity)', () => {
  it('fails when a floor has two disconnected walkable pockets', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 1);
    setCell(cells, 1, 1, 0, width, height, CELL.ROOM);
    setCell(cells, 8, 8, 0, width, height, CELL.ROOM);
    const { errors } = validateDungeon({ cells, width, height, floors: 1 });
    expect(hasRule(errors, 1)).toBe(true);
  });

  it('passes for a single connected blob', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 1);
    setCell(cells, 1, 1, 0, width, height, CELL.ROOM);
    setCell(cells, 2, 1, 0, width, height, CELL.ROOM);
    const { errors } = validateDungeon({ cells, width, height, floors: 1 });
    expect(hasRule(errors, 1)).toBe(false);
  });
});

describe('validateDungeon — rule 2 (global connectivity)', () => {
  const rooms = [
    { id: 0, floor: 0 }, { id: 1, floor: 0 }, { id: 2, floor: 1 },
  ];

  it('fails when a floor is unreachable from the entrance', () => {
    const edges = [{ a: 0, b: 1, weight: 1, kind: 'mst' }]; // room 2 (floor 1) unreachable
    const dungeon = { rooms, edges, floors: 2, mission: { entranceRoomId: 0 } };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 2)).toBe(true);
  });

  it('passes when every floor is reachable', () => {
    const edges = [
      { a: 0, b: 1, weight: 1, kind: 'mst' },
      { a: 1, b: 2, weight: 1, kind: 'vertical' },
    ];
    const dungeon = { rooms, edges, floors: 2, mission: { entranceRoomId: 0 } };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 2)).toBe(false);
  });
});

describe('validateDungeon — rule 3 (paired, accessible stairs)', () => {
  it('fails when a footprint is not fully CELL.STAIR', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 2);
    setCell(cells, 5, 5, 0, width, height, CELL.STAIR);
    // (6,5) left EMPTY instead of STAIR on floor 0.
    setCell(cells, 5, 5, 1, width, height, CELL.STAIR);
    setCell(cells, 6, 5, 1, width, height, CELL.STAIR);
    const links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 5, y: 5, w: 2, h: 1 }];
    const { errors } = validateDungeon({ cells, width, height, links });
    expect(hasRule(errors, 3)).toBe(true);
  });

  it('fails when a footprint is stamped but never carved into', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 2);
    for (const floor of [0, 1]) {
      setCell(cells, 5, 5, floor, width, height, CELL.STAIR);
      setCell(cells, 6, 5, floor, width, height, CELL.STAIR);
    }
    const links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 5, y: 5, w: 2, h: 1 }];
    const { errors } = validateDungeon({ cells, width, height, links });
    expect(hasRule(errors, 3)).toBe(true);
  });

  it('passes when both sides are stamped and carved into', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 2);
    for (const floor of [0, 1]) {
      setCell(cells, 5, 5, floor, width, height, CELL.STAIR);
      setCell(cells, 6, 5, floor, width, height, CELL.STAIR);
      setCell(cells, 4, 5, floor, width, height, CELL.HALLWAY);
    }
    const links = [{ id: 0, fromFloor: 0, toFloor: 1, x: 5, y: 5, w: 2, h: 1 }];
    const { errors } = validateDungeon({ cells, width, height, links });
    expect(hasRule(errors, 3)).toBe(false);
  });
});

describe('validateDungeon — rule 4 (well-formed doors)', () => {
  // A 3x3 room at (2,2), corridor cell at (3,1) touching its north wall at x=3.
  function buildFixture() {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 1);
    for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) setCell(cells, x, y, 0, width, height, CELL.ROOM);
    setCell(cells, 3, 1, 0, width, height, CELL.HALLWAY);
    const walls = [
      // room's north wall, minus the door cell at x=3
      { floor: 0, x1: 2, y1: 2, x2: 3, y2: 2, isDoor: false, doorId: null },
      { floor: 0, x1: 4, y1: 2, x2: 5, y2: 2, isDoor: false, doorId: null },
      // corridor's side walls, terminating exactly at the door's jambs
      { floor: 0, x1: 3, y1: 1, x2: 3, y2: 2, isDoor: false, doorId: null },
      { floor: 0, x1: 4, y1: 1, x2: 4, y2: 2, isDoor: false, doorId: null },
      { floor: 0, x1: 3, y1: 2, x2: 4, y2: 2, isDoor: true, doorId: 0 },
    ];
    const doors = [{ id: 0, floor: 0, x1: 3, y1: 2, x2: 4, y2: 2, roomId: 0, secret: false }];
    return { cells, width, height, walls, doors };
  }

  it('passes for a properly jambed door', () => {
    const { errors } = validateDungeon(buildFixture());
    expect(hasRule(errors, 4)).toBe(false);
  });

  it('fails when a perpendicular jamb wall is missing', () => {
    const fixture = buildFixture();
    fixture.walls = fixture.walls.filter((w) => !(w.x1 === 3 && w.y1 === 1));
    const { errors } = validateDungeon(fixture);
    expect(hasRule(errors, 4)).toBe(true);
  });

  it('fails when a side of the door is not walkable', () => {
    const fixture = buildFixture();
    setCell(fixture.cells, 3, 1, 0, fixture.width, fixture.height, CELL.EMPTY);
    const { errors } = validateDungeon(fixture);
    expect(hasRule(errors, 4)).toBe(true);
  });
});

describe('validateDungeon — rule 5 (no orphan walls)', () => {
  it('fails for a wall bordering no walkable cell', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 1); // all EMPTY
    const walls = [{ floor: 0, x1: 3, y1: 3, x2: 4, y2: 3, isDoor: false, doorId: null }];
    const { errors } = validateDungeon({ cells, width, height, walls });
    expect(hasRule(errors, 5)).toBe(true);
  });

  it('passes for a wall bordering a walkable cell', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 1);
    setCell(cells, 3, 3, 0, width, height, CELL.ROOM);
    const walls = [{ floor: 0, x1: 3, y1: 3, x2: 4, y2: 3, isDoor: false, doorId: null }];
    const { errors } = validateDungeon({ cells, width, height, walls });
    expect(hasRule(errors, 5)).toBe(false);
  });
});

describe('validateDungeon — rule 6 (no content-less dead end)', () => {
  it('fails for an unprotected HALLWAY dead end', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 1);
    // A 2-cell dangling tendril: (5,5) has exactly one walkable neighbor,
    // (6,5), and neither cell is adjacent to any ROOM/STAIR.
    setCell(cells, 5, 5, 0, width, height, CELL.HALLWAY);
    setCell(cells, 6, 5, 0, width, height, CELL.HALLWAY);
    const { errors } = validateDungeon({ cells, width, height, floors: 1 });
    expect(hasRule(errors, 6)).toBe(true);
  });

  it('passes when the dead end is adjacent to a room', () => {
    const width = 10;
    const height = 10;
    const cells = createGrid(width, height, 1);
    setCell(cells, 5, 5, 0, width, height, CELL.HALLWAY);
    setCell(cells, 4, 5, 0, width, height, CELL.ROOM);
    const { errors } = validateDungeon({ cells, width, height, floors: 1 });
    expect(hasRule(errors, 6)).toBe(false);
  });
});

describe('validateDungeon — rule 7 (wall budget)', () => {
  it('fails at or above the 1500 global budget', () => {
    const walls = new Array(1500).fill({ floor: 0, x1: 0, y1: 0, x2: 1, y2: 0 });
    const { errors } = validateDungeon({ walls });
    expect(hasRule(errors, 7)).toBe(true);
  });

  it('passes comfortably under budget', () => {
    const { errors } = validateDungeon({ walls: [] });
    expect(hasRule(errors, 7)).toBe(false);
  });
});

describe('validateDungeon — rule 8 (every room has a door)', () => {
  it('fails when a room has no doors', () => {
    const { errors } = validateDungeon({ rooms: [{ id: 0, floor: 0, doors: [] }] });
    expect(hasRule(errors, 8)).toBe(true);
  });

  it('passes when every room has >=1 door', () => {
    const { errors } = validateDungeon({ rooms: [{ id: 0, floor: 0, doors: [0] }] });
    expect(hasRule(errors, 8)).toBe(false);
  });
});

describe('validateDungeon — rule 9 (complete key)', () => {
  it('fails when a room has no matching Area', () => {
    const dungeon = {
      rooms: [{ id: 0, floor: 0 }],
      areas: [],
      key: { entries: [] },
    };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 9)).toBe(true);
  });

  it('passes with a 1:1 Room-Area-KeyEntry mapping', () => {
    const dungeon = {
      rooms: [{ id: 0, floor: 0 }],
      areas: [{ id: 0, floor: 0, roomId: 0 }],
      key: { entries: [{ areaId: 0 }] },
    };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 9)).toBe(false);
  });
});

describe('validateDungeon — rule 10 (unique, contiguous labels)', () => {
  it('fails when per-floor numbering has a gap', () => {
    const dungeon = {
      areas: [
        { id: 0, floor: 0, label: '1-01' },
        { id: 1, floor: 0, label: '1-03' },
      ],
      key: { scheme: 'per-floor' },
      config: { key: { startAt: 1 } },
    };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 10)).toBe(true);
  });

  it('passes for contiguous per-floor numbering', () => {
    const dungeon = {
      areas: [
        { id: 0, floor: 0, label: '1-01' },
        { id: 1, floor: 0, label: '1-02' },
      ],
      key: { scheme: 'per-floor' },
      config: { key: { startAt: 1 } },
    };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 10)).toBe(false);
  });
});

describe('validateDungeon — rule 11 (symmetric exits)', () => {
  it('fails for a one-directional exit', () => {
    const dungeon = {
      areas: [
        { id: 0, floor: 0, label: '1-01', exits: [{ dir: 'n', toLabel: '1-02', via: 'door' }] },
        { id: 1, floor: 0, label: '1-02', exits: [] },
      ],
      key: {},
    };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 11)).toBe(true);
  });

  it('passes for symmetric exits', () => {
    const dungeon = {
      areas: [
        { id: 0, floor: 0, label: '1-01', exits: [{ dir: 'n', toLabel: '1-02', via: 'door' }] },
        { id: 1, floor: 0, label: '1-02', exits: [{ dir: 's', toLabel: '1-01', via: 'door' }] },
      ],
      key: {},
    };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 11)).toBe(false);
  });
});

describe('validateDungeon — rule 12 (valid anchors)', () => {
  const width = 20;
  const height = 20;

  it('fails when the anchor sits off a walkable cell', () => {
    const cells = createGrid(width, height, 1);
    const dungeon = { cells, width, height, walls: [], areas: [{ id: 0, floor: 0, label: '1-01', cx: 5, cy: 5 }] };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 12)).toBe(true);
  });

  it('fails when the anchor is too close to a wall', () => {
    const cells = createGrid(width, height, 1);
    setCell(cells, 5, 5, 0, width, height, CELL.ROOM);
    const walls = [{ floor: 0, x1: 5, y1: 5, x2: 6, y2: 5, isDoor: false, doorId: null }];
    const dungeon = { cells, width, height, walls, areas: [{ id: 0, floor: 0, label: '1-01', cx: 5.1, cy: 5.1 }] };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 12)).toBe(true);
  });

  it('passes for a walkable anchor comfortably clear of any wall', () => {
    const cells = createGrid(width, height, 1);
    for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) setCell(cells, x, y, 0, width, height, CELL.ROOM);
    const walls = [{ floor: 0, x1: 4, y1: 4, x2: 8, y2: 4, isDoor: false, doorId: null }];
    const dungeon = { cells, width, height, walls, areas: [{ id: 0, floor: 0, label: '1-01', cx: 6, cy: 6 }] };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 12)).toBe(false);
  });
});

describe('validateDungeon — rule 13 (faithful legend)', () => {
  it('fails when the legend is missing a used symbol', () => {
    const dungeon = {
      rooms: [{ role: 'entrance' }, { role: 'filler' }],
      links: [],
      key: { legend: [{ kind: 'area' }] }, // missing 'entrance'
    };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 13)).toBe(true);
  });

  it('fails when the legend declares an unused symbol', () => {
    const dungeon = {
      rooms: [{ role: 'filler' }],
      links: [],
      key: { legend: [{ kind: 'area' }, { kind: 'treasure' }] },
    };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 13)).toBe(true);
  });

  it('requires stairUp/stairDown exactly when links exist', () => {
    const withLinks = {
      rooms: [{ role: 'filler' }],
      links: [{ id: 0 }],
      key: { legend: [{ kind: 'area' }] },
    };
    expect(hasRule(validateDungeon(withLinks).errors, 13)).toBe(true);

    const withLinksAndSymbols = {
      rooms: [{ role: 'filler' }],
      links: [{ id: 0 }],
      key: { legend: [{ kind: 'area' }, { kind: 'stairUp' }, { kind: 'stairDown' }] },
    };
    expect(hasRule(validateDungeon(withLinksAndSymbols).errors, 13)).toBe(false);
  });
});

describe('validateDungeon — rule 14 (Notes budget)', () => {
  it('fails over the 60 Notes global budget', () => {
    const areas = new Array(59).fill({});
    const links = new Array(1).fill({});
    const { errors } = validateDungeon({ areas, links });
    expect(hasRule(errors, 14)).toBe(true);
  });

  it('passes under budget', () => {
    const { errors } = validateDungeon({ areas: [{}], links: [] });
    expect(hasRule(errors, 14)).toBe(false);
  });
});

describe('validateDungeon — rule 15 (integral linkage)', () => {
  it('fails when a KeyEntry references a non-existent Area', () => {
    const dungeon = { areas: [{ id: 0 }], key: { entries: [{ areaId: 1, label: 'x' }] } };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 15)).toBe(true);
  });

  it('passes when every KeyEntry references a real Area', () => {
    const dungeon = { areas: [{ id: 0 }], key: { entries: [{ areaId: 0, label: 'x' }] } };
    const { errors } = validateDungeon(dungeon);
    expect(hasRule(errors, 15)).toBe(false);
  });
});

// Integration: real generateDungeon() output across a handful of seeds/configs
// must satisfy every invariant. This is a fast sanity net (tens of seeds), NOT
// the M7 "10,000 seeds in CI" property test — that's separate, not-yet-built
// infrastructure.
describe('validateDungeon — integration against real generateDungeon output', () => {
  const BASE_CONFIG = {
    width: 30,
    height: 30,
    rooms: { count: 6, sizeMean: 5, sizeStdDev: 1.5, sizeMin: 3, sizeMax: 8, spawnRadius: 12, separationIters: 40 },
    cycleRate: 0.25,
    verticalLinksPerGap: 2,
    carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
    pruneIterations: 8,
    key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
  };

  const cases = [
    { seed: 'validate-1f-a', floors: 1 },
    { seed: 'validate-1f-b', floors: 1 },
    { seed: 'validate-2f-a', floors: 2, width: 40, height: 40 },
    { seed: 'validate-2f-b', floors: 2, width: 40, height: 40 },
    { seed: 'validate-3f-a', floors: 3, width: 45, height: 45 },
    { seed: 'validate-5f-a', floors: 5, width: 50, height: 50 },
  ];

  for (const { seed, floors, width, height } of cases) {
    it(`is valid for seed=${seed} floors=${floors}`, () => {
      const config = { ...BASE_CONFIG, seed, floors, width: width ?? BASE_CONFIG.width, height: height ?? BASE_CONFIG.height };
      const dungeon = generateDungeon(config);
      const { ok, errors } = validateDungeon(dungeon);
      if (!ok) {
        console.error(`validation errors for ${seed}:`, errors);
      }
      expect(ok).toBe(true);
    });
  }
});
