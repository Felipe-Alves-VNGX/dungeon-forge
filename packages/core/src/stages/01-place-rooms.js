import { sampleShapeParams } from '../shapes.js';

/**
 * @param {import('../types.js').RoomParams} params
 * @param {number} floor
 * @param {import('../rng.js').Rng} rng
 *
 * Note: returned rooms are NOT guaranteed to fit within any particular grid
 * width/height — this function has no width/height parameter and only shapes
 * rooms relative to params.spawnRadius/sizeMax. Callers must clamp/validate
 * bounds themselves (see pipeline.js's post-placeRooms clamp).
 */
export function placeRooms(params, floor, rng) {
  const candidateCount = Math.round(params.count * 1.6);

  const candidates = [];
  for (let i = 0; i < candidateCount; i++) {
    const angle = rng.float() * Math.PI * 2;
    const r = Math.sqrt(rng.float()) * params.spawnRadius;
    const cx = Math.cos(angle) * r;
    const cy = Math.sin(angle) * r;

    const clamp = (v) => Math.max(params.sizeMin, Math.min(params.sizeMax, v));
    const w = clamp(Math.round(rng.normal(params.sizeMean, params.sizeStdDev)));
    const h = clamp(Math.round(rng.normal(params.sizeMean, params.sizeStdDev)));

    candidates.push({ cx, cy, w, h });
  }

  // Steering separation: push overlapping candidates apart.
  for (let iter = 0; iter < params.separationIters; iter++) {
    for (let i = 0; i < candidates.length; i++) {
      let pushX = 0;
      let pushY = 0;
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const a = candidates[i];
        const b = candidates[j];
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const overlapX = (a.w + b.w) / 2 - Math.abs(dx);
        const overlapY = (a.h + b.h) / 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const dist = Math.hypot(dx, dy) || 0.0001;
          pushX += (dx / dist) * overlapX * 0.5;
          pushY += (dy / dist) * overlapY * 0.5;
        }
      }
      candidates[i].cx += pushX;
      candidates[i].cy += pushY;
    }
  }

  // Snap to integer cell grid. The offset centers the spawn disk at the
  // grid's approximate midpoint, assuming a grid roughly
  // 2 * (spawnRadius + sizeMax/2) on a side — matching SPEC.md's own
  // default parameters.
  const offset = params.spawnRadius + params.sizeMax / 2;
  const boxed = candidates.map((c) => {
    const x = Math.round(c.cx + offset - c.w / 2);
    const y = Math.round(c.cy + offset - c.h / 2);
    return { x, y, w: c.w, h: c.h, area: c.w * c.h };
  });

  const sorted = [...boxed].sort((a, b) => b.area - a.area);
  const promoted = sorted.slice(0, params.count);
  const residual = sorted.slice(params.count);

  const shapeTable = params.shapes ?? [{ type: 'rect', weight: 1 }];

  const rooms = promoted.map((b, i) => {
    const type = rng.weightedPick(shapeTable, (e) => e.weight).type;
    return {
      id: i,
      floor,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
      role: 'filler',
      doors: [],
      shape: { type, params: sampleShapeParams(type, rng) },
    };
  });

  const residualCells = residual.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));

  return { rooms, residualCells };
}
