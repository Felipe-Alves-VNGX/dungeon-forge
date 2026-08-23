/**
 * @param {import('../types.js').Edge[]} allEdges
 * @param {import('../types.js').Edge[]} mstEdges
 * @param {number} cycleRate
 * @param {import('../rng.js').Rng} rng
 */
export function addCycles(allEdges, mstEdges, cycleRate, rng) {
  const mstKeys = new Set(mstEdges.map((e) => `${e.a}-${e.b}`));
  const result = [...mstEdges];

  for (const edge of allEdges) {
    const key = `${edge.a}-${edge.b}`;
    if (mstKeys.has(key)) continue;
    if (rng.chance(cycleRate)) {
      result.push({ a: edge.a, b: edge.b, weight: edge.weight, kind: 'cycle' });
    }
  }

  return result;
}
