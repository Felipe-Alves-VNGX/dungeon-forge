import { describe, it, expect, vi } from 'vitest';
import { buildRenderPlan } from '../src/plan.js';
import { drawPlanToContext } from '../src/draw.js';

function fakeDungeon() {
  return {
    width: 5,
    height: 5,
    floors: 1,
    cells: new Uint8Array(25).fill(1), // all ROOM
    walls: [
      { floor: 0, x1: 0, y1: 0, x2: 5, y2: 0, isDoor: false, doorId: null },
      { floor: 0, x1: 0, y1: 0, x2: 0, y2: 5, isDoor: false, doorId: null },
      { floor: 0, x1: 2, y1: 0, x2: 3, y2: 0, isDoor: true, doorId: 0 },
    ],
  };
}

describe('buildRenderPlan', () => {
  it('scales wall coordinates by gridSize', () => {
    const plan = buildRenderPlan(fakeDungeon(), 0, 100);
    const wall = plan.wallLines.find((w) => w.x2 === 500 && w.y2 === 0);
    expect(wall).toBeTruthy();
  });

  it('only includes walls for the requested floor', () => {
    const dungeon = fakeDungeon();
    dungeon.walls.push({ floor: 1, x1: 0, y1: 0, x2: 1, y2: 0, isDoor: false, doorId: null });
    const plan = buildRenderPlan(dungeon, 0, 100);
    expect(plan.wallLines).toHaveLength(3);
  });

  it('marks door walls distinctly from regular walls', () => {
    const plan = buildRenderPlan(fakeDungeon(), 0, 100);
    expect(plan.wallLines.some((w) => w.isDoor)).toBe(true);
    expect(plan.wallLines.some((w) => !w.isDoor)).toBe(true);
  });

  it('renders a secret door as a plain wall — the image must not give it away', () => {
    const dungeon = fakeDungeon();
    dungeon.doors = [{ id: 0, floor: 0, x1: 2, y1: 0, x2: 3, y2: 0, roomId: 0, secret: true }];
    const plan = buildRenderPlan(dungeon, 0, 100);
    const secretWall = plan.wallLines.find((w) => w.x1 === 200 && w.x2 === 300);
    expect(secretWall.isDoor).toBe(false);
  });

  it('computes pixel width/height from cell width/height and gridSize', () => {
    const plan = buildRenderPlan(fakeDungeon(), 0, 100);
    expect(plan.width).toBe(500);
    expect(plan.height).toBe(500);
  });

  it('produces no text or symbol draw data — plan has no "label" or "text" fields', () => {
    const plan = buildRenderPlan(fakeDungeon(), 0, 100);
    expect(plan).not.toHaveProperty('labels');
    expect(plan.wallLines.every((w) => !('text' in w))).toBe(true);
  });
});

describe('drawPlanToContext', () => {
  it('draws the floor mask and every wall line, and issues no fillText calls', () => {
    const plan = {
      width: 200,
      height: 200,
      floorRects: [{ x: 0, y: 0, w: 200, h: 200 }],
      wallLines: [
        { x1: 0, y1: 0, x2: 200, y2: 0, isDoor: false },
        { x1: 100, y1: 0, x2: 150, y2: 0, isDoor: true },
      ],
    };
    const ctx = {
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      set fillStyle(v) {},
      set strokeStyle(v) {},
      set lineWidth(v) {},
    };

    drawPlanToContext(plan, ctx);

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 200);
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
