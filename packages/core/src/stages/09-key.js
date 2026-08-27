// packages/core/src/stages/09-key.js

const TITLE_BY_ROLE = {
  entrance: 'Entrada',
  climax: 'Câmara final',
  treasure: 'Câmara isolada',
  junction: 'Encruzilhada',
  filler: null, // filled per-area below: "Área {label}"
};

const LEGEND_BY_ROLE = {
  entrance: { kind: 'entrance', caption: 'Entrada da masmorra' },
  climax: { kind: 'climax', caption: 'Câmara final' },
  treasure: { kind: 'treasure', caption: 'Câmara de tesouro opcional' },
  junction: { kind: 'junction', caption: 'Encruzilhada' },
};

function formatLabel(scheme, floor, number, padTo) {
  const padded = String(number).padStart(padTo, '0');
  if (scheme === 'flat') return String(number);
  if (scheme === 'alpha-floor') {
    const letter = String.fromCharCode('A'.charCodeAt(0) + floor);
    return `${letter}${number}`;
  }
  // per-floor
  return `${floor + 1}-${padded}`;
}

function buildAdjacency(rooms, adjacency) {
  const adj = new Map(rooms.map((r) => [r.id, []]));
  for (const { a, b } of adjacency) {
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  return adj;
}

function sortByPosition(ids, roomsById) {
  return [...ids].sort((idA, idB) => {
    const a = roomsById.get(idA);
    const b = roomsById.get(idB);
    return a.y - b.y || a.x - b.x || idA - idB;
  });
}

// SPEC.md §5.11: BFS from the entrance, floor by floor, crossing a
// VerticalLink only after the current floor's frontier is fully drained.
// `adjacency` carries same-floor room-room edges only; `links` carries the
// cross-floor connections separately so they can be deferred.
function bfsOrder(rooms, adjacency, links, entranceRoomId) {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const sameFloorAdj = buildAdjacency(rooms, adjacency);
  const verticalAdj = buildAdjacency(rooms, links.map((l) => ({ a: l.roomIdFrom, b: l.roomIdTo })));

  const order = [];
  const seen = new Set([entranceRoomId]);
  let frontier = [entranceRoomId];

  while (frontier.length > 0) {
    let sameFloorFrontier = sortByPosition(frontier, roomsById);
    const crossFloorPending = [];

    while (sameFloorFrontier.length > 0) {
      order.push(...sameFloorFrontier);

      const next = [];
      for (const id of sameFloorFrontier) {
        for (const neighbor of sameFloorAdj.get(id)) {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            next.push(neighbor);
          }
        }
        for (const neighbor of verticalAdj.get(id)) {
          if (!seen.has(neighbor)) crossFloorPending.push(neighbor);
        }
      }
      sameFloorFrontier = sortByPosition(next, roomsById);
    }

    const nextFloorEntries = [...new Set(crossFloorPending)].filter((id) => !seen.has(id));
    for (const id of nextFloorEntries) seen.add(id);
    frontier = sortByPosition(nextFloorEntries, roomsById);
  }

  // Rooms unreachable from the entrance (shouldn't happen post-validation)
  // are appended in id order so buildKey never silently drops one.
  for (const r of rooms) {
    if (!seen.has(r.id)) order.push(r.id);
  }

  return order;
}

// Reads exits straight off the room's own physical doors (dir/toRoomId,
// traced through the grid in extractWalls) rather than the abstract
// room-adjacency graph — dir is real geometry now, not a hardcoded n/s
// guess, and via:'secret' is that specific door's own flag.
function exitsFor(room, doorsById, links, labelByRoomId) {
  const exits = [];
  for (const doorId of room.doors) {
    const door = doorsById.get(doorId);
    if (!door || door.toRoomId == null) continue;
    const toLabel = labelByRoomId.get(door.toRoomId);
    if (toLabel === undefined) continue;
    exits.push({ dir: door.dir, toLabel, via: door.secret ? 'secret' : 'door' });
  }
  for (const link of links) {
    if (link.roomIdFrom === room.id) {
      exits.push({ dir: 'down', toLabel: labelByRoomId.get(link.roomIdTo), via: 'stair' });
    }
    if (link.roomIdTo === room.id) {
      exits.push({ dir: 'up', toLabel: labelByRoomId.get(link.roomIdFrom), via: 'stair' });
    }
  }
  return exits;
}

const OPPOSITE_DIR = { n: 's', s: 'n', e: 'w', w: 'e', up: 'down', down: 'up' };

// Door-based exits are traced independently per door (nearest room reached
// by BFS from that specific opening) — accurate, but not guaranteed
// symmetric where 3+ rooms share overlapping corridor space near a
// junction: a spur room's door can correctly find a neighbor as "nearest",
// while that neighbor's own doors both find a *different*, closer room as
// nearest and never point back. SPEC.md §6 invariant 11 requires symmetry
// regardless, so fill in the missing side with the geometric opposite
// direction — the best available guess, and the common case (a real
// mutual door pair) never hits this since `hasReciprocal` is already true.
// Stair exits are skipped: exitsFor already emits both ends of every
// VerticalLink from the link itself, so they're symmetric by construction.
function synchronizeExits(areas) {
  const areasByLabel = new Map(areas.map((a) => [a.label, a]));
  for (const area of areas) {
    for (const exit of [...area.exits]) {
      if (exit.via === 'stair') continue;
      const target = areasByLabel.get(exit.toLabel);
      if (!target || target === area) continue;
      const hasReciprocal = target.exits.some((e) => e.toLabel === area.label);
      if (!hasReciprocal) {
        target.exits.push({ dir: OPPOSITE_DIR[exit.dir] ?? exit.dir, toLabel: area.label, via: exit.via });
      }
    }
  }
}

function descriptionFor(role, exits, exitsInEntries, hasSecretDoor) {
  const exitLines = exitsInEntries
    ? exits.map((e) => `${e.dir.toUpperCase()} → ${e.toLabel}`).join(', ')
    : '';
  switch (role) {
    case 'entrance':
      return `Aponta as saídas e o que se vê do umbral. ${exitLines}`.trim();
    case 'climax':
      return `Ponto mais distante da entrada. ${exitLines}`.trim();
    case 'treasure': {
      const secretNote = hasSecretDoor ? ' Uma das entradas é secreta.' : '';
      return `Ramo opcional, alcançável só por um caminho alternativo.${secretNote} ${exitLines}`.trim();
    }
    case 'junction':
      return `Encruzilhada com ${exits.length} saídas. ${exitLines}`.trim();
    default:
      return exitLines;
  }
}

/**
 * @param {import('../types.js').Room[]} rooms
 * @param {{a:number,b:number}[]} adjacency
 * @param {number} entranceRoomId
 * @param {{scheme:string, numberJunctions:boolean, startAt:number, padTo:number, exitsInEntries:boolean}} keyConfig
 * @param {import('../types.js').VerticalLink[]} [links]
 * @param {import('../types.js').Door[]} [doors]
 */
export function buildKey(rooms, adjacency, entranceRoomId, keyConfig, links = [], doors = []) {
  const order = bfsOrder(rooms, adjacency, links, entranceRoomId);
  const roomsById = new Map(rooms.map((r) => [r.id, r]));

  // Every Room is always numbered (SPEC §5.11 "toda Room, sempre"). `numberJunctions`
  // refers to numbering standalone corridor junctions (Areas with roomId: null),
  // which this stage doesn't produce yet — so it's correctly unused here, not a bug.
  const numberedIds = order;

  // Per-floor numbering: each floor gets its own counter, incremented as
  // numberedIds is walked in BFS order. (A single global counter would
  // assign floor 1's first room a number that skips past floor 0's rooms
  // whenever floor 0 is visited first in BFS order.)
  const labelByRoomId = new Map();
  const floorCounters = new Map();
  for (const id of numberedIds) {
    const r = roomsById.get(id);
    const countOnFloor = (floorCounters.get(r.floor) ?? 0) + 1;
    floorCounters.set(r.floor, countOnFloor);
    labelByRoomId.set(id, formatLabel(keyConfig.scheme, r.floor, keyConfig.startAt - 1 + countOnFloor, keyConfig.padTo));
  }

  const doorsById = new Map(doors.map((d) => [d.id, d]));
  const areas = numberedIds.map((id) => {
    const r = roomsById.get(id);
    return {
      id,
      label: labelByRoomId.get(id),
      floor: r.floor,
      roomId: id,
      cx: r.cx,
      cy: r.cy,
      exits: exitsFor(r, doorsById, links, labelByRoomId),
    };
  });

  synchronizeExits(areas);

  const entries = areas.map((area) => {
    const room = roomsById.get(area.roomId);
    const title = TITLE_BY_ROLE[room.role] ?? `Área ${area.label}`;
    const hasSecretDoor = room.doors.some((id) => doorsById.get(id)?.secret);
    return {
      areaId: area.id,
      label: area.label,
      title,
      description: descriptionFor(room.role, area.exits, keyConfig.exitsInEntries, hasSecretDoor),
      tags: [room.role],
    };
  });

  const rolesPresent = new Set(rooms.map((r) => r.role));
  const legend = Object.entries(LEGEND_BY_ROLE)
    .filter(([role]) => rolesPresent.has(role))
    .map(([, symbol]) => ({ ...symbol }));
  legend.push({ kind: 'area', caption: 'Área sem papel especial' });
  if (links.length > 0) {
    legend.push({ kind: 'stairUp', caption: 'Escada subindo' });
    legend.push({ kind: 'stairDown', caption: 'Escada descendo' });
  }
  if (doors.some((d) => d.secret)) {
    legend.push({ kind: 'secret', caption: 'Porta secreta' });
  }

  const byLabel = Object.fromEntries(areas.map((a) => [a.label, a.id]));

  return {
    areas,
    key: {
      scheme: keyConfig.scheme,
      entries,
      legend,
      byLabel,
    },
  };
}

/**
 * @param {import('../types.js').Area[]} areas
 * @param {{entries: import('../types.js').KeyEntry[], legend: import('../types.js').LegendSymbol[]}} key
 */
export function keyToMarkdown(areas, key) {
  const byFloor = new Map();
  for (const area of areas) {
    if (!byFloor.has(area.floor)) byFloor.set(area.floor, []);
    byFloor.get(area.floor).push(area);
  }

  const entriesByAreaId = new Map(key.entries.map((e) => [e.areaId, e]));

  let md = '';
  for (const [floor, floorAreas] of [...byFloor.entries()].sort((a, b) => a[0] - b[0])) {
    md += `# Andar ${floor + 1}\n\n`;
    for (const area of floorAreas) {
      const entry = entriesByAreaId.get(area.id);
      md += `## ${area.label} — ${entry.title}\n\n${entry.description}\n\n`;
    }
  }

  md += `## Legenda\n\n`;
  for (const symbol of key.legend) {
    md += `- **${symbol.kind}**: ${symbol.caption}\n`;
  }

  return md;
}
