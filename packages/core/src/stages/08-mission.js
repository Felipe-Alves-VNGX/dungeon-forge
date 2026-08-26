function buildAdjacency(rooms, edges) {
  const adj = new Map(rooms.map((r) => [r.id, []]));
  for (const e of edges) {
    adj.get(e.a).push({ to: e.b, kind: e.kind });
    adj.get(e.b).push({ to: e.a, kind: e.kind });
  }
  return adj;
}

function bfsDistances(adj, startId, edgeFilter = () => true) {
  const dist = new Map([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    for (const { to, kind } of adj.get(cur)) {
      if (!edgeFilter(kind)) continue;
      if (!dist.has(to)) {
        dist.set(to, dist.get(cur) + 1);
        queue.push(to);
      }
    }
  }
  return dist;
}

function bfsPath(adj, startId, targetId) {
  const prev = new Map([[startId, null]]);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === targetId) break;
    for (const { to } of adj.get(cur)) {
      if (!prev.has(to)) {
        prev.set(to, cur);
        queue.push(to);
      }
    }
  }
  const path = [];
  let node = targetId;
  while (node !== null && node !== undefined) {
    path.unshift(node);
    node = prev.get(node) ?? null;
    if (node === startId) {
      path.unshift(startId);
      break;
    }
  }
  return path;
}

/**
 * @param {import('../types.js').Room[]} rooms
 * @param {import('../types.js').Edge[]} edges
 * @param {import('../types.js').VerticalLink[]} [links]
 */
export function mission(rooms, edges, links = []) {
  const adj = buildAdjacency(rooms, edges);
  const degree = new Map(rooms.map((r) => [r.id, adj.get(r.id).length]));
  const leaves = rooms.filter((r) => degree.get(r.id) === 1);

  // Highest floor = numerically smallest floor index in this codebase's
  // convention (floor 0 is the topmost/entrance floor); within this plan's
  // single-floor scope, every room is on the same floor, so "highest floor"
  // degenerates to "any leaf", picked by farthest distance from the graph's
  // approximate centroid to keep the choice non-arbitrary and deterministic.
  const highestFloor = Math.min(...rooms.map((r) => r.floor));
  const topFloorLeaves = leaves.filter((r) => r.floor === highestFloor);
  const pool = topFloorLeaves.length > 0 ? topFloorLeaves : leaves.length > 0 ? leaves : rooms;

  const centroidX = rooms.reduce((s, r) => s + r.cx, 0) / rooms.length;
  const centroidY = rooms.reduce((s, r) => s + r.cy, 0) / rooms.length;

  // Prefer entrance candidates that are reachable via MST edges (main dungeon structure)
  // over those only connected via cycle edges (hidden paths).
  const mstReachSize = new Map();
  for (const candidate of pool) {
    const reach = bfsDistances(adj, candidate.id, (kind) => kind === 'mst');
    mstReachSize.set(candidate.id, reach.size);
  }

  const byReachThenCentroid = [...pool].sort((a, b) => {
    const reachA = mstReachSize.get(a.id) ?? -1;
    const reachB = mstReachSize.get(b.id) ?? -1;
    if (reachA !== reachB) return reachB - reachA; // prefer larger MST reach
    // fallback to distance from centroid
    const da = Math.hypot(a.cx - centroidX, a.cy - centroidY);
    const db = Math.hypot(b.cx - centroidX, b.cy - centroidY);
    return db - da || a.id - b.id;
  });
  const entrance = byReachThenCentroid[0];

  const distFromEntrance = bfsDistances(adj, entrance.id);

  // treasure: a dead end of the *structural* graph (mst+vertical edges only —
  // the backbone that's guaranteed connected) that also picked up a 'cycle'
  // edge. A plain leaf of the combined graph can never satisfy "reachable
  // only via cycle edges" literally — spanningTree() is a spanning tree over
  // every room, so every room always has >=1 non-cycle edge — this is the
  // closest achievable reading: a dead end with exactly one bonus/alternate
  // route in, which is what descriptionFor()'s treasure text already says.
  const structuralDegree = new Map(rooms.map((r) => [r.id, 0]));
  for (const r of rooms) {
    structuralDegree.set(r.id, adj.get(r.id).filter((e) => e.kind !== 'cycle').length);
  }
  const treasureIds = new Set();
  for (const r of rooms) {
    if (r.id === entrance.id) continue;
    if (structuralDegree.get(r.id) === 1 && degree.get(r.id) >= 2) {
      treasureIds.add(r.id);
      r.role = 'treasure';
    }
  }

  const deepestFloor = Math.max(...rooms.map((r) => r.floor));
  const climaxCandidates = leaves.filter((r) => r.id !== entrance.id && !treasureIds.has(r.id));
  const pickPool = climaxCandidates.length > 0 ? climaxCandidates : rooms.filter((r) => r.id !== entrance.id && !treasureIds.has(r.id));
  const climax = pickPool.reduce((best, r) => {
    const rEcc = distFromEntrance.get(r.id) ?? -1;
    const bestEcc = distFromEntrance.get(best.id) ?? -1;
    const rDeepBonus = r.floor === deepestFloor ? 1 : 0;
    const bestDeepBonus = best.floor === deepestFloor ? 1 : 0;
    if (rEcc + rDeepBonus > bestEcc + bestDeepBonus) return r;
    if (rEcc + rDeepBonus === bestEcc + bestDeepBonus && r.id < best.id) return r;
    return best;
  }, pickPool[0]);

  for (const r of rooms) {
    if (r.id === entrance.id) {
      r.role = 'entrance';
    } else if (r.role === 'treasure') {
      // already set above; preserve treasure role
    } else if (r.id === climax.id) {
      r.role = 'climax';
    } else if (degree.get(r.id) >= 3) {
      r.role = 'junction';
    } else {
      r.role = 'filler';
    }
  }

  const path = bfsPath(adj, entrance.id, climax.id);

  const criticalLinks = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const link = links.find(
      (l) => (l.roomIdFrom === a && l.roomIdTo === b) || (l.roomIdFrom === b && l.roomIdTo === a)
    );
    if (link) criticalLinks.push(link.id);
  }

  return {
    entranceRoomId: entrance.id,
    climaxRoomId: climax.id,
    path,
    criticalLinks,
    optionalBranches: [],
  };
}

/**
 * Marks one door of each treasure room as secret — SPEC.md §5.10's "fase 2"
 * key/lock idea, scoped down: a treasure room already has an alternate
 * (cycle-edge) route in by construction, so hiding one of its doors gives it
 * a genuine secret entrance without ever making the room unreachable. Rooms
 * with only one door are left alone (that door must stay discoverable).
 * @param {import('../types.js').Room[]} rooms
 * @param {import('../types.js').Door[]} doors
 */
export function assignSecretDoors(rooms, doors) {
  const doorsById = new Map(doors.map((d) => [d.id, d]));
  for (const room of rooms) {
    if (room.role !== 'treasure' || room.doors.length < 2) continue;
    const door = doorsById.get(room.doors[room.doors.length - 1]);
    if (door) door.secret = true;
  }
}
