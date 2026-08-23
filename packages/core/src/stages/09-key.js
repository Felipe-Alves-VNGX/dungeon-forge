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

function bfsOrder(rooms, adjacency, entranceRoomId) {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const adj = buildAdjacency(rooms, adjacency);
  const order = [];
  const seen = new Set([entranceRoomId]);
  let frontier = [entranceRoomId];

  while (frontier.length > 0) {
    const sorted = [...frontier].sort((idA, idB) => {
      const a = roomsById.get(idA);
      const b = roomsById.get(idB);
      return a.y - b.y || a.x - b.x || idA - idB;
    });
    order.push(...sorted);

    const next = [];
    for (const id of sorted) {
      for (const neighbor of adj.get(id)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  // Rooms unreachable from the entrance (shouldn't happen post-validation)
  // are appended in id order so buildKey never silently drops one.
  for (const r of rooms) {
    if (!seen.has(r.id)) order.push(r.id);
  }

  return order;
}

function exitsFor(roomId, adjacency, labelByRoomId) {
  const exits = [];
  for (const { a, b } of adjacency) {
    if (a === roomId) exits.push({ dir: 'n', toLabel: labelByRoomId.get(b), via: 'door' });
    if (b === roomId) exits.push({ dir: 's', toLabel: labelByRoomId.get(a), via: 'door' });
  }
  return exits;
}

function descriptionFor(role, exits, exitsInEntries) {
  const exitLines = exitsInEntries
    ? exits.map((e) => `${e.dir.toUpperCase()} → ${e.toLabel}`).join(', ')
    : '';
  switch (role) {
    case 'entrance':
      return `Aponta as saídas e o que se vê do umbral. ${exitLines}`.trim();
    case 'climax':
      return `Ponto mais distante da entrada. ${exitLines}`.trim();
    case 'treasure':
      return `Ramo opcional, alcançável só por um caminho alternativo. ${exitLines}`.trim();
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
 */
export function buildKey(rooms, adjacency, entranceRoomId, keyConfig) {
  const order = bfsOrder(rooms, adjacency, entranceRoomId);
  const roomsById = new Map(rooms.map((r) => [r.id, r]));

  const numberedIds = order.filter((id) => {
    const r = roomsById.get(id);
    return r.role !== 'junction' || keyConfig.numberJunctions || true; // every Room is numbered (SPEC §5.11 "toda Room, sempre")
  });

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

  const areas = numberedIds.map((id) => {
    const r = roomsById.get(id);
    return {
      id,
      label: labelByRoomId.get(id),
      floor: r.floor,
      roomId: id,
      cx: r.cx,
      cy: r.cy,
      exits: exitsFor(id, adjacency, labelByRoomId),
    };
  });

  const entries = areas.map((area) => {
    const room = roomsById.get(area.roomId);
    const title = TITLE_BY_ROLE[room.role] ?? `Área ${area.label}`;
    return {
      areaId: area.id,
      label: area.label,
      title,
      description: descriptionFor(room.role, area.exits, keyConfig.exitsInEntries),
      tags: [room.role],
    };
  });

  const rolesPresent = new Set(rooms.map((r) => r.role));
  const legend = Object.entries(LEGEND_BY_ROLE)
    .filter(([role]) => rolesPresent.has(role))
    .map(([, symbol]) => symbol);
  legend.push({ kind: 'area', caption: 'Área sem papel especial' });

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
