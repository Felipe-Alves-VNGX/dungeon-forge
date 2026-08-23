
/** sfc32 — small, fast, seeded PRNG. Returns a function () => float in [0,1). */
function sfc32(a, b, c, d) {
  return function next() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    let t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** xmur3 — string hash used to seed sfc32 from an arbitrary seed string. */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function makeFloatFn(seedString) {
  const seedGen = xmur3(seedString);
  return sfc32(seedGen(), seedGen(), seedGen(), seedGen());
}

function buildRng(floatFn) {
  return {
    float() {
      return floatFn();
    },
    int(min, max) {
      return Math.floor(floatFn() * (max - min + 1)) + min;
    },
    normal(mean, stdDev) {
      // Box-Muller transform
      let u = 0;
      let v = 0;
      while (u === 0) u = floatFn();
      while (v === 0) v = floatFn();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + z * stdDev;
    },
    pick(arr) {
      return arr[Math.floor(floatFn() * arr.length)];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(floatFn() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    chance(p) {
      return floatFn() < p;
    },
  };
}

/** @param {string} seed */
export function makeRng(seed) {
  return buildRng(makeFloatFn(seed));
}

/**
 * Derives an independent substream for one pipeline stage. Two stages
 * derived from the same rootSeed never share state — consuming one
 * substream never perturbs another (see SPEC.md §5.1).
 * @param {string} rootSeed
 * @param {string} stageName
 */
export function deriveRng(rootSeed, stageName) {
  return buildRng(makeFloatFn(`${rootSeed}::${stageName}`));
}
