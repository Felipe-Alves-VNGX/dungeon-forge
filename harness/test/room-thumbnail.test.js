// harness/test/room-thumbnail.test.js
import { describe, it, expect } from 'vitest';
import { buildRoomThumbnailSVG } from '../src/room-thumbnail.js';

function room(x, y, w, h, shape) {
  return { id: 0, floor: 0, x, y, w, h, cx: x + w / 2, cy: y + h / 2, role: 'filler', doors: [], shape };
}

describe('buildRoomThumbnailSVG', () => {
  it('draws one cell rect per cell in a rect room (contiguous block)', () => {
    const r = room(0, 0, 3, 2);
    const svg = buildRoomThumbnailSVG(r, [], 0);
    const matches = svg.match(/class="room-cell"/g) ?? [];
    expect(matches).toHaveLength(6); // 3 * 2
  });

  it('draws fewer cells for an L-shaped room than its full bounding box', () => {
    const r = room(0, 0, 6, 6, { type: 'l', params: { corner: 'ne' } });
    const svg = buildRoomThumbnailSVG(r, [], 0);
    const matches = svg.match(/class="room-cell"/g) ?? [];
    expect(matches.length).toBeLessThan(36); // 6 * 6, notch removes cells
    expect(matches.length).toBeGreaterThan(0);
  });

  it('still renders the compass rose and door ticks', () => {
    const r = room(0, 0, 4, 4);
    const door = { id: 0, floor: 0, x1: 0, y1: 0, x2: 4, y2: 0, roomId: 0, secret: false, dir: 'n', toRoomId: null };
    r.doors = [0];
    const svg = buildRoomThumbnailSVG(r, [door], 0);
    expect(svg).toContain('compass-ring');
    expect(svg).toContain('door-tick');
  });
});
