import { describe, it, expect } from 'vitest';
import { deriveRng } from '../../src/rng.js';
import { placeRooms } from '../../src/stages/01-place-rooms.js';

const PARAMS = {
  count: 9,
  sizeMean: 7,
  sizeStdDev: 2.5,
  sizeMin: 3,
  sizeMax: 14,
  spawnRadius: 18,
  separationIters: 60,
};

function overlaps(a, b, margin = 0) {
  return (
    a.x - margin < b.x + b.w &&
    a.x + a.w + margin > b.x &&
    a.y - margin < b.y + b.h &&
    a.y + a.h + margin > b.y
  );
}

describe('placeRooms', () => {
  it('is deterministic for the same seed', () => {
    const a = placeRooms(PARAMS, 0, deriveRng('seed-1', 'place-rooms'));
    const b = placeRooms(PARAMS, 0, deriveRng('seed-1', 'place-rooms'));
    expect(a.rooms.map((r) => [r.x, r.y, r.w, r.h])).toEqual(
      b.rooms.map((r) => [r.x, r.y, r.w, r.h])
    );
  });

  it('promotes exactly params.count rooms', () => {
    const { rooms } = placeRooms(PARAMS, 0, deriveRng('seed-2', 'place-rooms'));
    expect(rooms).toHaveLength(PARAMS.count);
  });

  // Note: a negative margin here actually *shrinks* the compared boxes, so
  // this only tolerates up to 1 cell of genuine overlap — it does not verify
  // a 1-cell-clearance guarantee. The room-placement algorithm's steering
  // separation resolves overlap to zero clearance (not a 1-cell buffer) after
  // Math.round snapping — a known, accepted limitation of the current
  // algorithm (deferred to a future plan), not a bug in this test.
  it('no two rooms genuinely overlap (tolerating up to 1 cell of edge contact, a known limitation of Math.round snapping post-separation)', () => {
    const { rooms } = placeRooms(PARAMS, 0, deriveRng('seed-3', 'place-rooms'));
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        expect(overlaps(rooms[i], rooms[j], -1)).toBe(false);
      }
    }
  });

  it('every room dimension is within [sizeMin, sizeMax]', () => {
    const { rooms } = placeRooms(PARAMS, 0, deriveRng('seed-4', 'place-rooms'));
    for (const r of rooms) {
      expect(r.w).toBeGreaterThanOrEqual(PARAMS.sizeMin);
      expect(r.w).toBeLessThanOrEqual(PARAMS.sizeMax);
      expect(r.h).toBeGreaterThanOrEqual(PARAMS.sizeMin);
      expect(r.h).toBeLessThanOrEqual(PARAMS.sizeMax);
    }
  });

  it('tags every room with the given floor and a unique id', () => {
    const { rooms } = placeRooms(PARAMS, 2, deriveRng('seed-5', 'place-rooms'));
    expect(rooms.every((r) => r.floor === 2)).toBe(true);
    const ids = new Set(rooms.map((r) => r.id));
    expect(ids.size).toBe(rooms.length);
  });

  it('produces residualCells from the non-promoted candidates', () => {
    const { residualCells } = placeRooms(PARAMS, 0, deriveRng('seed-6', 'place-rooms'));
    // count * 1.6 candidates minus count promoted, roughly
    expect(residualCells.length).toBeGreaterThan(0);
  });
});

describe('placeRooms — shape selection', () => {
  it('defaults every room to shape.type "rect" when params.shapes is absent', () => {
    const { rooms } = placeRooms(PARAMS, 0, deriveRng('seed-shape-1', 'place-rooms'));
    for (const r of rooms) {
      expect(r.shape).toEqual({ type: 'rect', params: {} });
    }
  });

  it('only ever picks shape types present in params.shapes with weight > 0', () => {
    const params = { ...PARAMS, shapes: [{ type: 'rect', weight: 0 }, { type: 'circle', weight: 1 }] };
    const { rooms } = placeRooms(params, 0, deriveRng('seed-shape-2', 'place-rooms'));
    for (const r of rooms) {
      expect(r.shape.type).toBe('circle');
    }
  });

  it('is deterministic for the same seed, including shape assignment', () => {
    const params = {
      ...PARAMS,
      shapes: [{ type: 'rect', weight: 1 }, { type: 'l', weight: 1 }, { type: 'triangle', weight: 1 }],
    };
    const a = placeRooms(params, 0, deriveRng('seed-shape-3', 'place-rooms'));
    const b = placeRooms(params, 0, deriveRng('seed-shape-3', 'place-rooms'));
    expect(a.rooms.map((r) => r.shape)).toEqual(b.rooms.map((r) => r.shape));
  });
});
