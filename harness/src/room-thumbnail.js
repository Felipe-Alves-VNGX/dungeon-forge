// harness/src/room-thumbnail.js
//
// Pure SVG builder for a single room's local-view thumbnail: the room's
// rectangle, a tick per door on the side it actually sits on (dashed if
// secret), and a compass rose. Everything lives inside one rotating <g> so
// the compass always correctly shows which way is which after spinning —
// a rigid transform never changes the room/compass's relative position.
const VIEWBOX = 180;
const CENTER = VIEWBOX / 2;
const MAX_ROOM_SIZE = 100;
const COMPASS_CX = 22;
const COMPASS_CY = 22;
const COMPASS_RADIUS = 14;

function doorTick(door, room, rect) {
  const horizontal = door.dir === 'n' || door.dir === 's';
  let x, y, w, h;

  if (horizontal) {
    const startFrac = (door.x1 - room.x) / room.w;
    const endFrac = (door.x2 - room.x) / room.w;
    const midFrac = (startFrac + endFrac) / 2;
    w = Math.max(6, (endFrac - startFrac) * rect.w);
    x = rect.x + midFrac * rect.w - w / 2;
    y = door.dir === 'n' ? rect.y - 3 : rect.y + rect.h - 3;
    h = 6;
  } else {
    const startFrac = (door.y1 - room.y) / room.h;
    const endFrac = (door.y2 - room.y) / room.h;
    const midFrac = (startFrac + endFrac) / 2;
    h = Math.max(6, (endFrac - startFrac) * rect.h);
    y = rect.y + midFrac * rect.h - h / 2;
    x = door.dir === 'w' ? rect.x - 3 : rect.x + rect.w - 3;
    w = 6;
  }

  const cls = door.secret ? 'door-tick door-tick-secret' : 'door-tick';
  return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" />`;
}

function compassRose() {
  const arms = [
    { dx: 0, dy: -COMPASS_RADIUS, label: 'N' },
    { dx: COMPASS_RADIUS, dy: 0, label: 'E' },
    { dx: 0, dy: COMPASS_RADIUS, label: 'S' },
    { dx: -COMPASS_RADIUS, dy: 0, label: 'O' },
  ];
  let out = `<circle class="compass-ring" cx="${COMPASS_CX}" cy="${COMPASS_CY}" r="${COMPASS_RADIUS}" />`;
  for (const arm of arms) {
    const x2 = COMPASS_CX + arm.dx;
    const y2 = COMPASS_CY + arm.dy;
    const cls = arm.label === 'N' ? 'compass-arm compass-arm-n' : 'compass-arm';
    out += `<line class="${cls}" x1="${COMPASS_CX}" y1="${COMPASS_CY}" x2="${x2}" y2="${y2}" />`;
    const lx = COMPASS_CX + arm.dx * 1.6;
    const ly = COMPASS_CY + arm.dy * 1.6;
    out += `<text class="compass-label" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central">${arm.label}</text>`;
  }
  return out;
}

/**
 * @param {import('@dungeon-forge/core').Room} room
 * @param {import('@dungeon-forge/core').Door[]} doors — full dungeon.doors; filtered internally to this room's own
 * @param {number} rotationDeg
 */
export function buildRoomThumbnailSVG(room, doors, rotationDeg = 0) {
  const scale = MAX_ROOM_SIZE / Math.max(room.w, room.h);
  const rectW = room.w * scale;
  const rectH = room.h * scale;
  const rect = { x: CENTER - rectW / 2, y: CENTER - rectH / 2, w: rectW, h: rectH };

  const roomDoors = doors.filter((d) => room.doors.includes(d.id));
  const ticks = roomDoors.map((d) => doorTick(d, room, rect)).join('');

  return `<svg class="room-thumb" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${rotationDeg}, ${CENTER}, ${CENTER})">
      <rect class="room-rect" x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${rect.w.toFixed(1)}" height="${rect.h.toFixed(1)}" rx="2" />
      ${ticks}
      ${compassRose()}
    </g>
  </svg>`;
}
