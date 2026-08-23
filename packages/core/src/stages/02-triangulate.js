import Delaunator from 'delaunator';

/** @param {import('../types.js').Room[]} rooms */
export function triangulate(rooms) {
  if (rooms.length < 2) return [];

  if (rooms.length === 2) {
    const [r0, r1] = rooms;
    return [{ a: r0.id, b: r1.id, weight: Math.hypot(r0.cx - r1.cx, r0.cy - r1.cy) }];
  }

  const points = rooms.flatMap((r) => [r.cx, r.cy]);
  const delaunay = new Delaunator(points);

  const edgeSet = new Map();
  const addEdge = (i, j) => {
    const roomI = rooms[i];
    const roomJ = rooms[j];
    const a = Math.min(roomI.id, roomJ.id);
    const b = Math.max(roomI.id, roomJ.id);
    const key = `${a}-${b}`;
    if (!edgeSet.has(key)) {
      const ra = a === roomI.id ? roomI : roomJ;
      const rb = a === roomI.id ? roomJ : roomI;
      edgeSet.set(key, { a, b, weight: Math.hypot(ra.cx - rb.cx, ra.cy - rb.cy) });
    }
  };

  for (let e = 0; e < delaunay.triangles.length; e++) {
    const p = delaunay.triangles[e];
    const q = delaunay.triangles[e % 3 === 2 ? e - 2 : e + 1];
    addEdge(p, q);
  }

  return Array.from(edgeSet.values());
}
