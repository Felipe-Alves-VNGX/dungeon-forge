// packages/core/src/stages/03-spanning-tree.js

/**
 * @param {import('../types.js').Room[]} rooms
 * @param {import('../types.js').Edge[]} edges
 */
export function spanningTree(rooms, edges) {
  if (rooms.length === 0) return [];

  const adjacency = new Map(rooms.map((r) => [r.id, []]));
  for (const e of edges) {
    adjacency.get(e.a).push(e);
    adjacency.get(e.b).push(e);
  }

  const visited = new Set([rooms[0].id]);
  const frontier = [...adjacency.get(rooms[0].id)];
  const mst = [];

  while (visited.size < rooms.length && frontier.length > 0) {
    frontier.sort((x, y) => x.weight - y.weight);
    const edge = frontier.shift();
    const otherEnd = visited.has(edge.a) ? edge.b : visited.has(edge.b) ? edge.a : null;
    if (otherEnd === null || visited.has(otherEnd)) continue;

    visited.add(otherEnd);
    mst.push({ a: edge.a, b: edge.b, weight: edge.weight, kind: 'mst' });
    frontier.push(...adjacency.get(otherEnd).filter((e) => {
      const far = e.a === otherEnd ? e.b : e.a;
      return !visited.has(far);
    }));
  }

  return mst;
}
