/**
 * Executes a RenderPlan against any CanvasRenderingContext2D-shaped object
 * (real canvas in the browser, OffscreenCanvas in a Worker, or a test spy).
 * Draws floor mask + walls only — no text, no numbers, no symbols
 * (SPEC.md §5.13: numbering is the Notes' job, not render's).
 * @param {{width:number,height:number,floorRects:{x:number,y:number,w:number,h:number}[],wallLines:{x1:number,y1:number,x2:number,y2:number,isDoor:boolean}[]}} plan
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawPlanToContext(plan, ctx) {
  ctx.save();
  ctx.fillStyle = '#2a2a2a';
  for (const rect of plan.floorRects) {
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  ctx.lineWidth = 4;
  for (const line of plan.wallLines) {
    ctx.strokeStyle = line.isDoor ? '#c8963e' : '#0a0a0a';
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Browser/Worker-only entry point: renders one floor to a Blob via
 * OffscreenCanvas. Not covered by the Node test suite — exercised manually
 * through the harness (Task 15).
 * @param {import('@dungeon-forge/core').Dungeon} dungeon
 * @param {number} floor
 * @param {number} gridSize
 */
export async function renderFloor(dungeon, floor, gridSize) {
  const { buildRenderPlan } = await import('./plan.js');
  const plan = buildRenderPlan(dungeon, floor, gridSize);

  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const ctx = canvas.getContext('2d');
  drawPlanToContext(plan, ctx);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { floor, blob, width: plan.width, height: plan.height };
}
