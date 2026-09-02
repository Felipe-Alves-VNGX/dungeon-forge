// packages/adapter-foundry/test/v13.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFloorScenes, wireStairRegionBehaviors, emitV13 } from '../src/v13.js';

function dungeon() {
  return {
    width: 20, height: 20, floors: 2,
    walls: [
      { floor: 0, x1: 0, y1: 0, x2: 2, y2: 0, isDoor: false, doorId: null },
      { floor: 1, x1: 0, y1: 0, x2: 2, y2: 0, isDoor: false, doorId: null },
    ],
    doors: [],
    areas: [
      { id: 0, label: '1-01', floor: 0, roomId: 0, cx: 2, cy: 2, exits: [] },
      { id: 1, label: '2-01', floor: 1, roomId: 1, cx: 2, cy: 2, exits: [] },
    ],
    rooms: [
      { id: 0, floor: 0, x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, role: 'entrance', doors: [] },
      { id: 1, floor: 1, x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, role: 'climax', doors: [] },
    ],
    links: [
      { id: 0, fromFloor: 0, toFloor: 1, x: 5, y: 5, w: 2, h: 1, kind: 'stair', roomIdFrom: 0, roomIdTo: 1 },
    ],
  };
}

describe('createFloorScenes', () => {
  beforeEach(() => {
    globalThis.Scene = {
      create: vi.fn(async (data) => ({ id: `scene-${data.name}`, name: data.name, _createData: data })),
    };
  });

  it('creates one Scene per floor, named by floor number', async () => {
    const pageIdByAreaId = new Map([[0, 'page-0'], [1, 'page-1']]);
    const scenes = await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId, 'journal-fake-id');
    expect(scenes).toHaveLength(2);
    expect(globalThis.Scene.create).toHaveBeenCalledTimes(2);
    const [floor0Call, floor1Call] = globalThis.Scene.create.mock.calls.map((c) => c[0]);
    expect(floor0Call.name).toContain('1'); // 1-indexed floor label per SPEC.md
    expect(floor1Call.name).toContain('2');
  });

  it('includes exactly the walls belonging to that floor, translated to pixels', async () => {
    const pageIdByAreaId = new Map([[0, 'page-0'], [1, 'page-1']]);
    await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId, 'journal-fake-id');
    const [floor0Call] = globalThis.Scene.create.mock.calls.map((c) => c[0]);
    expect(floor0Call.walls).toHaveLength(1);
    expect(floor0Call.walls[0].c).toEqual([0, 0, 200, 0]);
  });

  it('includes one Note per Area on that floor, referencing the right page id', async () => {
    const pageIdByAreaId = new Map([[0, 'page-0'], [1, 'page-1']]);
    await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId, 'journal-fake-id');
    const [floor0Call] = globalThis.Scene.create.mock.calls.map((c) => c[0]);
    expect(floor0Call.notes).toHaveLength(1);
    expect(floor0Call.notes[0].pageId).toBe('page-0');
    expect(floor0Call.notes[0].text).toBe('1-01');
    expect(floor0Call.notes[0].entryId).toBe('journal-fake-id');
  });

  it('includes one Region per VerticalLink touching that floor, tagged with the link id in flags', async () => {
    const pageIdByAreaId = new Map([[0, 'page-0'], [1, 'page-1']]);
    await createFloorScenes(dungeon(), { seed: 'x', gridSize: 100 }, pageIdByAreaId, 'journal-fake-id');
    const [floor0Call, floor1Call] = globalThis.Scene.create.mock.calls.map((c) => c[0]);
    expect(floor0Call.regions).toHaveLength(1);
    expect(floor1Call.regions).toHaveLength(1);
    expect(floor0Call.regions[0].flags['dungeon-forge'].linkId).toBe(0);
    expect(floor1Call.regions[0].flags['dungeon-forge'].linkId).toBe(0);
    expect(floor0Call.regions[0].shapes[0]).toEqual({ type: 'rectangle', x: 500, y: 500, width: 200, height: 100 });
  });
});

describe('wireStairRegionBehaviors', () => {
  function fakeScene(name, regionId, linkId) {
    const behaviorCreate = vi.fn(async (docType, [data]) => ({ ...data, id: `${regionId}-behavior` }));
    return {
      name,
      uuid: `Scene.${name}`,
      regions: {
        contents: [{
          id: regionId,
          uuid: `Scene.${name}.Region.${regionId}`,
          flags: { 'dungeon-forge': { linkId } },
          createEmbeddedDocuments: behaviorCreate,
        }],
      },
    };
  }

  it('wires each VerticalLink\'s two Regions to teleport to each other\'s UUID', async () => {
    const sceneA = fakeScene('floor0', 'region-a', 0);
    const sceneB = fakeScene('floor1', 'region-b', 0);
    await wireStairRegionBehaviors([sceneA, sceneB], { links: [{ id: 0, fromFloor: 0, toFloor: 1 }] });

    const regionA = sceneA.regions.contents[0];
    const regionB = sceneB.regions.contents[0];
    expect(regionA.createEmbeddedDocuments).toHaveBeenCalledWith('RegionBehavior', [
      { name: 'teleport', type: 'teleportToken', system: { destination: 'Scene.floor1.Region.region-b', choice: false } },
    ]);
    expect(regionB.createEmbeddedDocuments).toHaveBeenCalledWith('RegionBehavior', [
      { name: 'teleport', type: 'teleportToken', system: { destination: 'Scene.floor0.Region.region-a', choice: false } },
    ]);
  });
});

describe('emitV13', () => {
  function stubGlobals({ failAt } = {}) {
    const journalDelete = vi.fn(async () => {});
    globalThis.JournalEntry = {
      create: vi.fn(async () => {
        if (failAt === 'journal') throw new Error('journal creation failed');
        return { id: 'journal-1', pages: { contents: [{ id: 'p0', name: 'Legenda' }] }, delete: journalDelete };
      }),
    };
    const sceneDeletes = [];
    globalThis.Scene = {
      create: vi.fn(async (data) => {
        if (failAt === 'scene') throw new Error('scene creation failed');
        const del = vi.fn(async () => {});
        sceneDeletes.push(del);
        return {
          id: `scene-${data.name}`, name: data.name,
          regions: { contents: (data.regions ?? []).map((r, i) => ({ id: `r${i}`, uuid: `uuid-r${i}`, flags: r.flags, createEmbeddedDocuments: vi.fn(async () => { if (failAt === 'behavior') throw new Error('behavior wiring failed'); return []; }) })) },
          delete: del,
        };
      }),
    };
    return { journalDelete, sceneDeletes };
  }

  it('returns {journal, scenes} on success', async () => {
    stubGlobals();
    const dungeon = { areas: [], key: { entries: [], legend: [] }, walls: [], doors: [], rooms: [], links: [], width: 10, height: 10, floors: 1 };
    const result = await emitV13(dungeon, { seed: 'x', gridSize: 100 });
    expect(result.journal.id).toBe('journal-1');
    expect(result.scenes).toHaveLength(1);
  });

  it('rolls back nothing extra if JournalEntry.create itself fails', async () => {
    stubGlobals({ failAt: 'journal' });
    const dungeon = { areas: [], key: { entries: [], legend: [] }, walls: [], doors: [], rooms: [], links: [], width: 10, height: 10, floors: 1 };
    await expect(emitV13(dungeon, { seed: 'x' })).rejects.toThrow('journal creation failed');
  });

  it('deletes the journal if Scene creation fails', async () => {
    const { journalDelete } = stubGlobals({ failAt: 'scene' });
    const dungeon = { areas: [], key: { entries: [], legend: [] }, walls: [], doors: [], rooms: [], links: [], width: 10, height: 10, floors: 1 };
    await expect(emitV13(dungeon, { seed: 'x' })).rejects.toThrow('scene creation failed');
    expect(journalDelete).toHaveBeenCalledTimes(1);
  });

  it('deletes the journal AND all scenes if behavior wiring fails', async () => {
    const { journalDelete, sceneDeletes } = stubGlobals({ failAt: 'behavior' });
    const dungeon = {
      areas: [], key: { entries: [], legend: [] }, walls: [], doors: [], rooms: [], width: 10, height: 10, floors: 2,
      links: [{ id: 0, fromFloor: 0, toFloor: 1 }],
    };
    await expect(emitV13(dungeon, { seed: 'x' })).rejects.toThrow('behavior wiring failed');
    expect(journalDelete).toHaveBeenCalledTimes(1);
    expect(sceneDeletes.every((d) => d.mock.calls.length === 1)).toBe(true);
  });
});
