// packages/adapter-foundry/src/v13.js
//
// v13 target: N Scenes (one per floor), each with real walls/notes and
// stair Regions (geometry only at first — see wireStairRegionBehaviors,
// which adds the paired teleport behavior once every floor's Scene
// exists, since a Region's teleport destination is the *other* floor's
// Region UUID, unknowable until that Scene has been created).
import { buildWallData, buildNoteData, buildStairNoteData } from './shared/geometry.js';
import { createKeyJournal, mapAreaPagesById } from './shared/key-journal.js';

// Rollback deletes are best-effort: a delete failure (e.g. permissions)
// must never replace the original error that triggered the rollback in
// the first place — it's logged, not thrown, so the real failure always
// propagates to the caller.
async function bestEffortDelete(docs) {
  await Promise.all(docs.map(async (doc) => {
    try {
      await doc.delete();
    } catch (deleteErr) {
      console.error('adapter-foundry: rollback delete failed', deleteErr);
    }
  }));
}

function sceneNameForFloor(dungeon, floor, config) {
  return `${config.seed} — Andar ${floor + 1}`;
}

function regionShapeForLink(link, gridSize) {
  return {
    type: 'rectangle',
    x: link.x * gridSize,
    y: link.y * gridSize,
    width: link.w * gridSize,
    height: link.h * gridSize,
  };
}

export async function createFloorScenes(dungeon, config, pageIdByAreaId, journalId) {
  const gridSize = config.gridSize ?? 100;
  const doorsById = new Map((dungeon.doors ?? []).map((d) => [d.id, d]));
  const rolesByRoomId = new Map(dungeon.rooms.map((r) => [r.id, r.role]));

  const scenes = [];
  try {
    for (let floor = 0; floor < dungeon.floors; floor++) {
      const walls = dungeon.walls
        .filter((w) => w.floor === floor)
        .map((w) => buildWallData(w, doorsById, gridSize));

      const notes = dungeon.areas
        .filter((a) => a.floor === floor)
        .map((a) => {
          const pageId = pageIdByAreaId.get(a.id);
          const role = rolesByRoomId.get(a.roomId) ?? 'filler';
          return buildNoteData(a, gridSize, pageId, journalId, role);
        });

      const regions = dungeon.links
        .filter((link) => link.fromFloor === floor || link.toFloor === floor)
        .map((link) => ({
          name: `stair-${link.id}`,
          shapes: [regionShapeForLink(link, gridSize)],
          flags: { 'dungeon-forge': { linkId: link.id } },
        }));

      const stairNotes = dungeon.links
        .filter((link) => link.fromFloor === floor || link.toFloor === floor)
        .map((link) => {
          const destinationRoomId = floor === link.fromFloor ? link.roomIdTo : link.roomIdFrom;
          const destinationArea = dungeon.areas.find((a) => a.roomId === destinationRoomId);
          const pageId = pageIdByAreaId.get(destinationArea.id);
          return buildStairNoteData(link, floor, destinationArea, gridSize, pageId, journalId);
        });

      const scene = await Scene.create({
        name: sceneNameForFloor(dungeon, floor, config),
        width: dungeon.width * gridSize,
        height: dungeon.height * gridSize,
        grid: { size: gridSize, type: 1 },
        background: { src: null },
        padding: 0,
        walls,
        notes: [...notes, ...stairNotes],
        regions,
      });
      scenes.push(scene);
    }
  } catch (err) {
    await bestEffortDelete(scenes);
    throw err;
  }
  return scenes;
}

export async function wireStairRegionBehaviors(scenes, dungeon) {
  const regionByLinkId = new Map();
  for (const scene of scenes) {
    for (const region of scene.regions.contents) {
      const linkId = region.flags?.['dungeon-forge']?.linkId;
      if (linkId === undefined) continue;
      if (!regionByLinkId.has(linkId)) regionByLinkId.set(linkId, []);
      regionByLinkId.get(linkId).push(region);
    }
  }

  for (const link of dungeon.links) {
    const [regionA, regionB] = regionByLinkId.get(link.id) ?? [];
    if (!regionA || !regionB) continue; // shouldn't happen for a valid Dungeon; nothing to wire otherwise
    await regionA.createEmbeddedDocuments('RegionBehavior', [
      { name: 'teleport', type: 'teleportToken', system: { destination: regionB.uuid, choice: false } },
    ]);
    await regionB.createEmbeddedDocuments('RegionBehavior', [
      { name: 'teleport', type: 'teleportToken', system: { destination: regionA.uuid, choice: false } },
    ]);
  }
}

export async function emitV13(dungeon, config) {
  const journal = await createKeyJournal(dungeon, config);
  try {
    const pageIdByAreaId = mapAreaPagesById(journal, dungeon);
    const scenes = await createFloorScenes(dungeon, config, pageIdByAreaId, journal.id);
    try {
      await wireStairRegionBehaviors(scenes, dungeon);
    } catch (err) {
      await bestEffortDelete(scenes);
      throw err;
    }
    return { journal, scenes };
  } catch (err) {
    try {
      await journal.delete();
    } catch (deleteErr) {
      console.error('adapter-foundry: rollback delete failed', deleteErr);
    }
    throw err;
  }
}
