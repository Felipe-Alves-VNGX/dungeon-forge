// packages/adapter-foundry/src/v13.js
//
// v13 target: N Scenes (one per floor), each with real walls/notes and
// stair Regions (geometry only at first — see wireStairRegionBehaviors,
// which adds the paired teleport behavior once every floor's Scene
// exists, since a Region's teleport destination is the *other* floor's
// Region UUID, unknowable until that Scene has been created).
import { buildWallData, buildNoteData } from './shared/geometry.js';

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

export async function createFloorScenes(dungeon, config, pageIdByAreaId) {
  const gridSize = config.gridSize ?? 100;
  const doorsById = new Map((dungeon.doors ?? []).map((d) => [d.id, d]));
  const rolesByRoomId = new Map(dungeon.rooms.map((r) => [r.id, r.role]));

  const scenes = [];
  for (let floor = 0; floor < dungeon.floors; floor++) {
    const walls = dungeon.walls
      .filter((w) => w.floor === floor)
      .map((w) => buildWallData(w, doorsById, gridSize));

    const notes = dungeon.areas
      .filter((a) => a.floor === floor)
      .map((a) => {
        const pageId = pageIdByAreaId.get(a.id);
        const role = rolesByRoomId.get(a.roomId) ?? 'filler';
        return buildNoteData(a, gridSize, pageId, /* journalId set by caller below */ undefined, role);
      });

    const regions = dungeon.links
      .filter((link) => link.fromFloor === floor || link.toFloor === floor)
      .map((link) => ({
        name: `stair-${link.id}`,
        shapes: [regionShapeForLink(link, gridSize)],
        flags: { 'dungeon-forge': { linkId: link.id } },
      }));

    const scene = await Scene.create({
      name: sceneNameForFloor(dungeon, floor, config),
      width: dungeon.width * gridSize,
      height: dungeon.height * gridSize,
      grid: { size: gridSize, type: 1 },
      background: { src: null },
      walls,
      notes,
      regions,
    });
    scenes.push(scene);
  }
  return scenes;
}
