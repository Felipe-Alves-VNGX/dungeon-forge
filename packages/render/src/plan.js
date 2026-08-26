/**
 * Pure translation of a Dungeon floor slice into pixel-space draw data.
 * No Canvas API is touched here — see draw.js for that.
 * @param {import('@dungeon-forge/core').Dungeon} dungeon
 * @param {number} floor
 * @param {number} gridSize
 */
export function buildRenderPlan(dungeon, floor, gridSize) {
  // A secret door renders as a plain wall — the floor image is the only
  // artifact that leaves core/render without a GM behind it (SPEC.md §5.13:
  // Notes carry the discoverable info and don't require regenerating the
  // image), so it must never visually give away where a secret door is.
  const doorsById = new Map((dungeon.doors ?? []).map((d) => [d.id, d]));

  const wallLines = dungeon.walls
    .filter((w) => w.floor === floor)
    .map((w) => ({
      x1: w.x1 * gridSize,
      y1: w.y1 * gridSize,
      x2: w.x2 * gridSize,
      y2: w.y2 * gridSize,
      isDoor: w.isDoor && !(w.doorId !== null && doorsById.get(w.doorId)?.secret),
    }));

  return {
    width: dungeon.width * gridSize,
    height: dungeon.height * gridSize,
    floorRects: [{ x: 0, y: 0, w: dungeon.width * gridSize, h: dungeon.height * gridSize }],
    wallLines,
  };
}
