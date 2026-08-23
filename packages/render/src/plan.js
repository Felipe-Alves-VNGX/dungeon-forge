/**
 * Pure translation of a Dungeon floor slice into pixel-space draw data.
 * No Canvas API is touched here — see draw.js for that.
 * @param {import('@dungeon-forge/core').Dungeon} dungeon
 * @param {number} floor
 * @param {number} gridSize
 */
export function buildRenderPlan(dungeon, floor, gridSize) {
  const wallLines = dungeon.walls
    .filter((w) => w.floor === floor)
    .map((w) => ({
      x1: w.x1 * gridSize,
      y1: w.y1 * gridSize,
      x2: w.x2 * gridSize,
      y2: w.y2 * gridSize,
      isDoor: w.isDoor,
    }));

  return {
    width: dungeon.width * gridSize,
    height: dungeon.height * gridSize,
    floorRects: [{ x: 0, y: 0, w: dungeon.width * gridSize, h: dungeon.height * gridSize }],
    wallLines,
  };
}
