var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../core/src/rng.js
function sfc32(a, b, c, d) {
  return function next() {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function next() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
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
      let u4 = 0;
      let v2 = 0;
      while (u4 === 0) u4 = floatFn();
      while (v2 === 0) v2 = floatFn();
      const z = Math.sqrt(-2 * Math.log(u4)) * Math.cos(2 * Math.PI * v2);
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
    weightedPick(entries, weightFn) {
      const total = entries.reduce((sum2, e) => sum2 + weightFn(e), 0);
      let roll = floatFn() * total;
      for (const entry of entries) {
        roll -= weightFn(entry);
        if (roll < 0) return entry;
      }
      return entries[entries.length - 1];
    },
    chance(p) {
      return floatFn() < p;
    }
  };
}
function deriveRng(rootSeed, stageName) {
  return buildRng(makeFloatFn(`${rootSeed}::${stageName}`));
}
var init_rng = __esm({
  "../core/src/rng.js"() {
  }
});

// ../core/src/grid.js
function createGrid(width, height, floors) {
  return new Uint8Array(width * height * floors);
}
function cellIndex(x, y, z, width, height) {
  return z * (width * height) + y * width + x;
}
function getCell(grid, x, y, z, width, height) {
  return grid[cellIndex(x, y, z, width, height)];
}
function setCell(grid, x, y, z, width, height, value) {
  grid[cellIndex(x, y, z, width, height)] = value;
}
function inBounds(x, y, z, width, height, floors) {
  return x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < floors;
}
function createRoomIdGrid(width, height, floors) {
  return new Uint16Array(width * height * floors).fill(NO_ROOM);
}
function getRoomId(roomIdAt, x, y, z, width, height) {
  return roomIdAt[cellIndex(x, y, z, width, height)];
}
function setRoomId(roomIdAt, x, y, z, width, height, roomId) {
  roomIdAt[cellIndex(x, y, z, width, height)] = roomId;
}
var CELL, NO_ROOM;
var init_grid = __esm({
  "../core/src/grid.js"() {
    CELL = Object.freeze({
      EMPTY: 0,
      ROOM: 1,
      HALLWAY: 2,
      STAIR: 3,
      BLOCKED: 4
    });
    NO_ROOM = 65535;
  }
});

// ../core/src/shapes.js
function rasterizeRect(room) {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}
function rasterizeL(room, params) {
  const notchW = Math.floor((room.w - 1) / 3);
  const notchH = Math.floor((room.h - 1) / 3);
  const notchXStart = params.corner === "ne" || params.corner === "se" ? room.w - notchW : 0;
  const notchYStart = params.corner === "sw" || params.corner === "se" ? room.h - notchH : 0;
  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const inNotch = dx >= notchXStart && dx < notchXStart + notchW && dy >= notchYStart && dy < notchYStart + notchH;
      if (!inNotch) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}
function rasterizeCross(room) {
  const notchW = Math.floor((room.w - 1) / 3);
  const notchH = Math.floor((room.h - 1) / 3);
  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const inVerticalArm = dx >= notchW && dx < room.w - notchW;
      const inHorizontalArm = dy >= notchH && dy < room.h - notchH;
      if (inVerticalArm || inHorizontalArm) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}
function rasterizeCircle(room) {
  const rw = room.w / 2;
  const rh = room.h / 2;
  const cx = room.x + rw;
  const cy = room.y + rh;
  const cells = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const px = room.x + dx + 0.5;
      const py = room.y + dy + 0.5;
      const nx = (px - cx) / rw;
      const ny = (py - cy) / rh;
      if (nx * nx + ny * ny <= 1) cells.push({ x: room.x + dx, y: room.y + dy });
    }
  }
  return cells;
}
function inTriangle(dx, dy, w, h, orientation) {
  switch (orientation) {
    case "up": {
      const rowFrac = (dy + 1) / h;
      const halfWidth = rowFrac * w / 2;
      const center = w / 2;
      return dx + 0.5 >= center - halfWidth && dx + 0.5 <= center + halfWidth;
    }
    case "down": {
      const rowFrac = (h - dy) / h;
      const halfWidth = rowFrac * w / 2;
      const center = w / 2;
      return dx + 0.5 >= center - halfWidth && dx + 0.5 <= center + halfWidth;
    }
    case "left": {
      const colFrac = (dx + 1) / w;
      const halfHeight = colFrac * h / 2;
      const center = h / 2;
      return dy + 0.5 >= center - halfHeight && dy + 0.5 <= center + halfHeight;
    }
    case "right": {
      const colFrac = (w - dx) / w;
      const halfHeight = colFrac * h / 2;
      const center = h / 2;
      return dy + 0.5 >= center - halfHeight && dy + 0.5 <= center + halfHeight;
    }
    default:
      throw new Error(`rasterizeTriangle: unknown orientation "${orientation}"`);
  }
}
function rasterizeTriangle(room, params) {
  const cells = [];
  const centroidX = Math.round(room.cx);
  const centroidY = Math.round(room.cy);
  const centroidDx = centroidX - room.x;
  const centroidDy = centroidY - room.y;
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      if (inTriangle(dx, dy, room.w, room.h, params.orientation) || dx === centroidDx && dy === centroidDy) {
        cells.push({ x: room.x + dx, y: room.y + dy });
      }
    }
  }
  return cells;
}
function rasterizeCustom(room, params) {
  return params.cells.map(([dx, dy]) => ({ x: room.x + dx, y: room.y + dy }));
}
function sampleShapeParams(type, rng) {
  switch (type) {
    case "l":
      return { corner: rng.pick(["nw", "ne", "sw", "se"]) };
    case "triangle":
      return { orientation: rng.pick(["up", "down", "left", "right"]) };
    default:
      return {};
  }
}
function rasterizeRoom(room) {
  const type = room.shape?.type ?? "rect";
  switch (type) {
    case "rect":
      return rasterizeRect(room);
    case "l":
      return rasterizeL(room, room.shape.params);
    case "cross":
      return rasterizeCross(room);
    case "circle":
      return rasterizeCircle(room);
    case "triangle":
      return rasterizeTriangle(room, room.shape.params);
    case "custom":
      return rasterizeCustom(room, room.shape.params);
    default:
      throw new Error(`rasterizeRoom: unknown shape type "${type}"`);
  }
}
var init_shapes = __esm({
  "../core/src/shapes.js"() {
  }
});

// ../core/src/stages/01-place-rooms.js
function placeRooms(params, floor, rng) {
  const candidateCount = Math.round(params.count * 1.6);
  const candidates = [];
  for (let i = 0; i < candidateCount; i++) {
    const angle = rng.float() * Math.PI * 2;
    const r = Math.sqrt(rng.float()) * params.spawnRadius;
    const cx = Math.cos(angle) * r;
    const cy = Math.sin(angle) * r;
    const clamp = (v2) => Math.max(params.sizeMin, Math.min(params.sizeMax, v2));
    const w = clamp(Math.round(rng.normal(params.sizeMean, params.sizeStdDev)));
    const h = clamp(Math.round(rng.normal(params.sizeMean, params.sizeStdDev)));
    candidates.push({ cx, cy, w, h });
  }
  for (let iter = 0; iter < params.separationIters; iter++) {
    for (let i = 0; i < candidates.length; i++) {
      let pushX = 0;
      let pushY = 0;
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const a = candidates[i];
        const b = candidates[j];
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const overlapX = (a.w + b.w) / 2 - Math.abs(dx);
        const overlapY = (a.h + b.h) / 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const dist2 = Math.hypot(dx, dy) || 1e-4;
          pushX += dx / dist2 * overlapX * 0.5;
          pushY += dy / dist2 * overlapY * 0.5;
        }
      }
      candidates[i].cx += pushX;
      candidates[i].cy += pushY;
    }
  }
  const offset = params.spawnRadius + params.sizeMax / 2;
  const boxed = candidates.map((c) => {
    const x = Math.round(c.cx + offset - c.w / 2);
    const y = Math.round(c.cy + offset - c.h / 2);
    return { x, y, w: c.w, h: c.h, area: c.w * c.h };
  });
  const sorted = [...boxed].sort((a, b) => b.area - a.area);
  const promoted = sorted.slice(0, params.count);
  const residual = sorted.slice(params.count);
  const shapeTable = params.shapes ?? [{ type: "rect", weight: 1 }];
  const rooms = promoted.map((b, i) => {
    const rawType = rng.weightedPick(shapeTable, (e) => e.weight).type;
    const type = rawType !== "rect" && (b.w < 4 || b.h < 4) ? "rect" : rawType;
    return {
      id: i,
      floor,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
      role: "filler",
      doors: [],
      shape: { type, params: sampleShapeParams(type, rng) }
    };
  });
  const residualCells = residual.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  return { rooms, residualCells };
}
var init_place_rooms = __esm({
  "../core/src/stages/01-place-rooms.js"() {
    init_shapes();
  }
});

// ../../node_modules/robust-predicates/esm/util.js
function sum(elen, e, flen, f, h) {
  let Q, Qnew, hh, bvirt;
  let enow = e[0];
  let fnow = f[0];
  let eindex = 0;
  let findex = 0;
  if (fnow > enow === fnow > -enow) {
    Q = enow;
    enow = e[++eindex];
  } else {
    Q = fnow;
    fnow = f[++findex];
  }
  let hindex = 0;
  if (eindex < elen && findex < flen) {
    if (fnow > enow === fnow > -enow) {
      Qnew = enow + Q;
      hh = Q - (Qnew - enow);
      enow = e[++eindex];
    } else {
      Qnew = fnow + Q;
      hh = Q - (Qnew - fnow);
      fnow = f[++findex];
    }
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
    while (eindex < elen && findex < flen) {
      if (fnow > enow === fnow > -enow) {
        Qnew = Q + enow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (enow - bvirt);
        enow = e[++eindex];
      } else {
        Qnew = Q + fnow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (fnow - bvirt);
        fnow = f[++findex];
      }
      Q = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
    }
  }
  while (eindex < elen) {
    Qnew = Q + enow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (enow - bvirt);
    enow = e[++eindex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  while (findex < flen) {
    Qnew = Q + fnow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (fnow - bvirt);
    fnow = f[++findex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  if (Q !== 0 || hindex === 0) {
    h[hindex++] = Q;
  }
  return hindex;
}
function estimate(elen, e) {
  let Q = e[0];
  for (let i = 1; i < elen; i++) Q += e[i];
  return Q;
}
function vec(n) {
  return new Float64Array(n);
}
var epsilon, splitter, resulterrbound;
var init_util = __esm({
  "../../node_modules/robust-predicates/esm/util.js"() {
    epsilon = 11102230246251565e-32;
    splitter = 134217729;
    resulterrbound = (3 + 8 * epsilon) * epsilon;
  }
});

// ../../node_modules/robust-predicates/esm/orient2d.js
function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
  let acxtail, acytail, bcxtail, bcytail;
  let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u32;
  const acx = ax - cx;
  const bcx = bx - cx;
  const acy = ay - cy;
  const bcy = by - cy;
  s1 = acx * bcy;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcx;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  B[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  B[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  B[2] = _j - (u32 - bvirt) + (_i - bvirt);
  B[3] = u32;
  let det = estimate(4, B);
  let errbound = ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) {
    return det;
  }
  bvirt = ax - acx;
  acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx;
  bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy;
  acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy;
  bcytail = by - (bcy + bvirt) + (bvirt - cy);
  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) {
    return det;
  }
  errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;
  s1 = acxtail * bcy;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcx;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u[3] = u32;
  const C1len = sum(4, B, 4, u, C1);
  s1 = acx * bcytail;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcxtail;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u[3] = u32;
  const C2len = sum(C1len, C1, 4, u, C2);
  s1 = acxtail * bcytail;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcxtail;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u[3] = u32;
  const Dlen = sum(C2len, C2, 4, u, D);
  return D[Dlen - 1];
}
function orient2d(ax, ay, bx, by, cx, cy) {
  const detleft = (ay - cy) * (bx - cx);
  const detright = (ax - cx) * (by - cy);
  const det = detleft - detright;
  const detsum = Math.abs(detleft + detright);
  if (Math.abs(det) >= ccwerrboundA * detsum) return det;
  return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}
var ccwerrboundA, ccwerrboundB, ccwerrboundC, B, C1, C2, D, u;
var init_orient2d = __esm({
  "../../node_modules/robust-predicates/esm/orient2d.js"() {
    init_util();
    ccwerrboundA = (3 + 16 * epsilon) * epsilon;
    ccwerrboundB = (2 + 12 * epsilon) * epsilon;
    ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;
    B = vec(4);
    C1 = vec(8);
    C2 = vec(12);
    D = vec(16);
    u = vec(4);
  }
});

// ../../node_modules/robust-predicates/esm/orient3d.js
var o3derrboundA, o3derrboundB, o3derrboundC, bc, ca, ab, at_b, at_c, bt_c, bt_a, ct_a, ct_b, bct, cat, abt, u2, _8, _8b, _16, _12, fin, fin2;
var init_orient3d = __esm({
  "../../node_modules/robust-predicates/esm/orient3d.js"() {
    init_util();
    o3derrboundA = (7 + 56 * epsilon) * epsilon;
    o3derrboundB = (3 + 28 * epsilon) * epsilon;
    o3derrboundC = (26 + 288 * epsilon) * epsilon * epsilon;
    bc = vec(4);
    ca = vec(4);
    ab = vec(4);
    at_b = vec(4);
    at_c = vec(4);
    bt_c = vec(4);
    bt_a = vec(4);
    ct_a = vec(4);
    ct_b = vec(4);
    bct = vec(8);
    cat = vec(8);
    abt = vec(8);
    u2 = vec(4);
    _8 = vec(8);
    _8b = vec(8);
    _16 = vec(16);
    _12 = vec(12);
    fin = vec(192);
    fin2 = vec(192);
  }
});

// ../../node_modules/robust-predicates/esm/incircle.js
var iccerrboundA, iccerrboundB, iccerrboundC, bc2, ca2, ab2, aa, bb, cc, u3, v, axtbc, aytbc, bxtca, bytca, cxtab, cytab, abt2, bct2, cat2, abtt, bctt, catt, _82, _162, _16b, _16c, _32, _32b, _48, _64, fin3, fin22;
var init_incircle = __esm({
  "../../node_modules/robust-predicates/esm/incircle.js"() {
    init_util();
    iccerrboundA = (10 + 96 * epsilon) * epsilon;
    iccerrboundB = (4 + 48 * epsilon) * epsilon;
    iccerrboundC = (44 + 576 * epsilon) * epsilon * epsilon;
    bc2 = vec(4);
    ca2 = vec(4);
    ab2 = vec(4);
    aa = vec(4);
    bb = vec(4);
    cc = vec(4);
    u3 = vec(4);
    v = vec(4);
    axtbc = vec(8);
    aytbc = vec(8);
    bxtca = vec(8);
    bytca = vec(8);
    cxtab = vec(8);
    cytab = vec(8);
    abt2 = vec(8);
    bct2 = vec(8);
    cat2 = vec(8);
    abtt = vec(4);
    bctt = vec(4);
    catt = vec(4);
    _82 = vec(8);
    _162 = vec(16);
    _16b = vec(16);
    _16c = vec(16);
    _32 = vec(32);
    _32b = vec(32);
    _48 = vec(48);
    _64 = vec(64);
    fin3 = vec(1152);
    fin22 = vec(1152);
  }
});

// ../../node_modules/robust-predicates/esm/insphere.js
var isperrboundA, isperrboundB, isperrboundC, ab3, bc3, cd, de, ea, ac, bd, ce, da, eb, abc, bcd, cde, dea, eab, abd, bce, cda, deb, eac, adet, bdet, cdet, ddet, edet, abdet, cddet, cdedet, deter, _83, _8b2, _8c, _163, _24, _482, _48b, _96, _192, _384x, _384y, _384z, _768, xdet, ydet, zdet, fin4;
var init_insphere = __esm({
  "../../node_modules/robust-predicates/esm/insphere.js"() {
    init_util();
    isperrboundA = (16 + 224 * epsilon) * epsilon;
    isperrboundB = (5 + 72 * epsilon) * epsilon;
    isperrboundC = (71 + 1408 * epsilon) * epsilon * epsilon;
    ab3 = vec(4);
    bc3 = vec(4);
    cd = vec(4);
    de = vec(4);
    ea = vec(4);
    ac = vec(4);
    bd = vec(4);
    ce = vec(4);
    da = vec(4);
    eb = vec(4);
    abc = vec(24);
    bcd = vec(24);
    cde = vec(24);
    dea = vec(24);
    eab = vec(24);
    abd = vec(24);
    bce = vec(24);
    cda = vec(24);
    deb = vec(24);
    eac = vec(24);
    adet = vec(1152);
    bdet = vec(1152);
    cdet = vec(1152);
    ddet = vec(1152);
    edet = vec(1152);
    abdet = vec(2304);
    cddet = vec(2304);
    cdedet = vec(3456);
    deter = vec(5760);
    _83 = vec(8);
    _8b2 = vec(8);
    _8c = vec(8);
    _163 = vec(16);
    _24 = vec(24);
    _482 = vec(48);
    _48b = vec(48);
    _96 = vec(96);
    _192 = vec(192);
    _384x = vec(384);
    _384y = vec(384);
    _384z = vec(384);
    _768 = vec(768);
    xdet = vec(96);
    ydet = vec(96);
    zdet = vec(96);
    fin4 = vec(1152);
  }
});

// ../../node_modules/robust-predicates/index.js
var init_robust_predicates = __esm({
  "../../node_modules/robust-predicates/index.js"() {
    init_orient2d();
    init_orient3d();
    init_incircle();
    init_insphere();
  }
});

// ../../node_modules/delaunator/index.js
function pseudoAngle(dx, dy) {
  const p = dx / (Math.abs(dx) + Math.abs(dy));
  return (dy > 0 ? 3 - p : 1 + p) / 4;
}
function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function inCircle(ax, ay, bx, by, cx, cy, px, py) {
  const dx = ax - px;
  const dy = ay - py;
  const ex = bx - px;
  const ey = by - py;
  const fx = cx - px;
  const fy = cy - py;
  const ap = dx * dx + dy * dy;
  const bp = ex * ex + ey * ey;
  const cp = fx * fx + fy * fy;
  return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
}
function circumradius(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  const x = (ey * bl - dy * cl) * d;
  const y = (dx * cl - ex * bl) * d;
  return x * x + y * y;
}
function circumcenter(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  const x = ax + (ey * bl - dy * cl) * d;
  const y = ay + (dx * cl - ex * bl) * d;
  return { x, y };
}
function quicksort(ids, dists, left, right) {
  if (right - left <= 20) {
    for (let i = left + 1; i <= right; i++) {
      const temp = ids[i];
      const tempDist = dists[temp];
      let j = i - 1;
      while (j >= left && dists[ids[j]] > tempDist) ids[j + 1] = ids[j--];
      ids[j + 1] = temp;
    }
  } else {
    const median = left + right >> 1;
    let i = left + 1;
    let j = right;
    swap(ids, median, i);
    if (dists[ids[left]] > dists[ids[right]]) swap(ids, left, right);
    if (dists[ids[i]] > dists[ids[right]]) swap(ids, i, right);
    if (dists[ids[left]] > dists[ids[i]]) swap(ids, left, i);
    const temp = ids[i];
    const tempDist = dists[temp];
    while (true) {
      do
        i++;
      while (dists[ids[i]] < tempDist);
      do
        j--;
      while (dists[ids[j]] > tempDist);
      if (j < i) break;
      swap(ids, i, j);
    }
    ids[left + 1] = ids[j];
    ids[j] = temp;
    if (right - i + 1 >= j - left) {
      quicksort(ids, dists, i, right);
      quicksort(ids, dists, left, j - 1);
    } else {
      quicksort(ids, dists, left, j - 1);
      quicksort(ids, dists, i, right);
    }
  }
}
function swap(arr, i, j) {
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
}
function defaultGetX(p) {
  return p[0];
}
function defaultGetY(p) {
  return p[1];
}
var EPSILON, EDGE_STACK, Delaunator;
var init_delaunator = __esm({
  "../../node_modules/delaunator/index.js"() {
    init_robust_predicates();
    EPSILON = Math.pow(2, -52);
    EDGE_STACK = new Uint32Array(512);
    Delaunator = class _Delaunator {
      /**
       * Constructs a delaunay triangulation object given an array of points (`[x, y]` by default).
       * `getX` and `getY` are optional functions of the form `(point) => value` for custom point formats.
       *
       * @template P
       * @param {P[]} points
       * @param {(p: P) => number} [getX]
       * @param {(p: P) => number} [getY]
       */
      // @ts-expect-error TS2322
      static from(points, getX = defaultGetX, getY = defaultGetY) {
        const n = points.length;
        const coords = new Float64Array(n * 2);
        for (let i = 0; i < n; i++) {
          const p = points[i];
          coords[2 * i] = getX(p);
          coords[2 * i + 1] = getY(p);
        }
        return new _Delaunator(coords);
      }
      /**
       * Constructs a delaunay triangulation object given an array of point coordinates of the form:
       * `[x0, y0, x1, y1, ...]` (use a typed array for best performance). Duplicate points are skipped.
       *
       * @param {T} coords
       */
      constructor(coords) {
        const n = coords.length >> 1;
        if (n > 0 && typeof coords[0] !== "number") throw new Error("Expected coords to contain numbers.");
        this.coords = coords;
        const maxTriangles = Math.max(2 * n - 5, 0);
        this._triangles = new Uint32Array(maxTriangles * 3);
        this._halfedges = new Int32Array(maxTriangles * 3);
        this._hashSize = Math.ceil(Math.sqrt(n));
        this._hullPrev = new Uint32Array(n);
        this._hullNext = new Uint32Array(n);
        this._hullTri = new Uint32Array(n);
        this._hullHash = new Int32Array(this._hashSize);
        this._ids = new Uint32Array(n);
        this._dists = new Float64Array(n);
        this.trianglesLen = 0;
        this._cx = 0;
        this._cy = 0;
        this._hullStart = 0;
        this.hull = this._triangles;
        this.triangles = this._triangles;
        this.halfedges = this._halfedges;
        this.update();
      }
      /**
       * Updates the triangulation if you modified `delaunay.coords` values in place, avoiding expensive memory allocations.
       * Useful for iterative relaxation algorithms such as Lloyd's.
       */
      update() {
        const { coords, _hullPrev: hullPrev, _hullNext: hullNext, _hullTri: hullTri, _hullHash: hullHash } = this;
        const n = coords.length >> 1;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < n; i++) {
          const x = coords[2 * i];
          const y = coords[2 * i + 1];
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          this._ids[i] = i;
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        let i0 = 0, i1 = 0, i2 = 0;
        for (let i = 0, minDist = Infinity; i < n; i++) {
          const d = dist(cx, cy, coords[2 * i], coords[2 * i + 1]);
          if (d < minDist) {
            i0 = i;
            minDist = d;
          }
        }
        const i0x = coords[2 * i0];
        const i0y = coords[2 * i0 + 1];
        for (let i = 0, minDist = Infinity; i < n; i++) {
          if (i === i0) continue;
          const d = dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]);
          if (d < minDist && d > 0) {
            i1 = i;
            minDist = d;
          }
        }
        let i1x = coords[2 * i1];
        let i1y = coords[2 * i1 + 1];
        let minRadius = Infinity;
        for (let i = 0; i < n; i++) {
          if (i === i0 || i === i1) continue;
          const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);
          if (r < minRadius) {
            i2 = i;
            minRadius = r;
          }
        }
        let i2x = coords[2 * i2];
        let i2y = coords[2 * i2 + 1];
        if (minRadius === Infinity) {
          for (let i = 0; i < n; i++) {
            this._dists[i] = coords[2 * i] - coords[0] || coords[2 * i + 1] - coords[1];
          }
          quicksort(this._ids, this._dists, 0, n - 1);
          const hull = new Uint32Array(n);
          let j = 0;
          for (let i = 0, d0 = -Infinity; i < n; i++) {
            const id = this._ids[i];
            const d = this._dists[id];
            if (d > d0) {
              hull[j++] = id;
              d0 = d;
            }
          }
          this.hull = hull.subarray(0, j);
          this.triangles = new Uint32Array(0);
          this.halfedges = new Int32Array(0);
          return;
        }
        if (orient2d(i0x, i0y, i1x, i1y, i2x, i2y) < 0) {
          const i = i1;
          const x = i1x;
          const y = i1y;
          i1 = i2;
          i1x = i2x;
          i1y = i2y;
          i2 = i;
          i2x = x;
          i2y = y;
        }
        const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
        this._cx = center.x;
        this._cy = center.y;
        for (let i = 0; i < n; i++) {
          this._dists[i] = dist(coords[2 * i], coords[2 * i + 1], center.x, center.y);
        }
        quicksort(this._ids, this._dists, 0, n - 1);
        this._hullStart = i0;
        let hullSize = 3;
        hullNext[i0] = hullPrev[i2] = i1;
        hullNext[i1] = hullPrev[i0] = i2;
        hullNext[i2] = hullPrev[i1] = i0;
        hullTri[i0] = 0;
        hullTri[i1] = 1;
        hullTri[i2] = 2;
        hullHash.fill(-1);
        hullHash[this._hashKey(i0x, i0y)] = i0;
        hullHash[this._hashKey(i1x, i1y)] = i1;
        hullHash[this._hashKey(i2x, i2y)] = i2;
        this.trianglesLen = 0;
        this._addTriangle(i0, i1, i2, -1, -1, -1);
        for (let k = 0, xp = 0, yp = 0; k < this._ids.length; k++) {
          const i = this._ids[k];
          const x = coords[2 * i];
          const y = coords[2 * i + 1];
          if (k > 0 && Math.abs(x - xp) <= EPSILON && Math.abs(y - yp) <= EPSILON) continue;
          xp = x;
          yp = y;
          if (i === i0 || i === i1 || i === i2) continue;
          let start = 0;
          for (let j = 0, key = this._hashKey(x, y); j < this._hashSize; j++) {
            start = hullHash[(key + j) % this._hashSize];
            if (start !== -1 && start !== hullNext[start]) break;
          }
          start = hullPrev[start];
          let e = start, q;
          while (q = hullNext[e], orient2d(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1]) >= 0) {
            e = q;
            if (e === start) {
              e = -1;
              break;
            }
          }
          if (e === -1) continue;
          let t = this._addTriangle(e, i, hullNext[e], -1, -1, hullTri[e]);
          hullTri[i] = this._legalize(t + 2);
          hullTri[e] = t;
          hullSize++;
          let n2 = hullNext[e];
          while (q = hullNext[n2], orient2d(x, y, coords[2 * n2], coords[2 * n2 + 1], coords[2 * q], coords[2 * q + 1]) < 0) {
            t = this._addTriangle(n2, i, q, hullTri[i], -1, hullTri[n2]);
            hullTri[i] = this._legalize(t + 2);
            hullNext[n2] = n2;
            hullSize--;
            n2 = q;
          }
          if (e === start) {
            while (q = hullPrev[e], orient2d(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1]) < 0) {
              t = this._addTriangle(q, i, e, -1, hullTri[e], hullTri[q]);
              this._legalize(t + 2);
              hullTri[q] = t;
              hullNext[e] = e;
              hullSize--;
              e = q;
            }
          }
          this._hullStart = hullPrev[i] = e;
          hullNext[e] = hullPrev[n2] = i;
          hullNext[i] = n2;
          hullHash[this._hashKey(x, y)] = i;
          hullHash[this._hashKey(coords[2 * e], coords[2 * e + 1])] = e;
        }
        this.hull = new Uint32Array(hullSize);
        for (let i = 0, e = this._hullStart; i < hullSize; i++) {
          this.hull[i] = e;
          e = hullNext[e];
        }
        this.triangles = this._triangles.subarray(0, this.trianglesLen);
        this.halfedges = this._halfedges.subarray(0, this.trianglesLen);
      }
      /**
       * Calculate an angle-based key for the edge hash used for advancing convex hull.
       *
       * @param {number} x
       * @param {number} y
       * @private
       */
      _hashKey(x, y) {
        return Math.floor(pseudoAngle(x - this._cx, y - this._cy) * this._hashSize) % this._hashSize;
      }
      /**
       * Flip an edge in a pair of triangles if it doesn't satisfy the Delaunay condition.
       *
       * @param {number} a
       * @private
       */
      _legalize(a) {
        const { _triangles: triangles, _halfedges: halfedges, coords } = this;
        let i = 0;
        let ar = 0;
        while (true) {
          const b = halfedges[a];
          const a0 = a - a % 3;
          ar = a0 + (a + 2) % 3;
          if (b === -1) {
            if (i === 0) break;
            a = EDGE_STACK[--i];
            continue;
          }
          const b0 = b - b % 3;
          const al = a0 + (a + 1) % 3;
          const bl = b0 + (b + 2) % 3;
          const p0 = triangles[ar];
          const pr = triangles[a];
          const pl = triangles[al];
          const p1 = triangles[bl];
          const illegal = inCircle(
            coords[2 * p0],
            coords[2 * p0 + 1],
            coords[2 * pr],
            coords[2 * pr + 1],
            coords[2 * pl],
            coords[2 * pl + 1],
            coords[2 * p1],
            coords[2 * p1 + 1]
          );
          if (illegal) {
            triangles[a] = p1;
            triangles[b] = p0;
            const hbl = halfedges[bl];
            if (hbl === -1) {
              let e = this._hullStart;
              do {
                if (this._hullTri[e] === bl) {
                  this._hullTri[e] = a;
                  break;
                }
                e = this._hullPrev[e];
              } while (e !== this._hullStart);
            }
            this._link(a, hbl);
            this._link(b, halfedges[ar]);
            this._link(ar, bl);
            const br = b0 + (b + 1) % 3;
            if (i < EDGE_STACK.length) {
              EDGE_STACK[i++] = br;
            }
          } else {
            if (i === 0) break;
            a = EDGE_STACK[--i];
          }
        }
        return ar;
      }
      /**
       * Link two half-edges to each other.
       * @param {number} a
       * @param {number} b
       * @private
       */
      _link(a, b) {
        this._halfedges[a] = b;
        if (b !== -1) this._halfedges[b] = a;
      }
      /**
       * Add a new triangle given vertex indices and adjacent half-edge ids.
       *
       * @param {number} i0
       * @param {number} i1
       * @param {number} i2
       * @param {number} a
       * @param {number} b
       * @param {number} c
       * @private
       */
      _addTriangle(i0, i1, i2, a, b, c) {
        const t = this.trianglesLen;
        this._triangles[t] = i0;
        this._triangles[t + 1] = i1;
        this._triangles[t + 2] = i2;
        this._link(t, a);
        this._link(t + 1, b);
        this._link(t + 2, c);
        this.trianglesLen += 3;
        return t;
      }
    };
  }
});

// ../core/src/stages/02-triangulate.js
function triangulate(rooms) {
  if (rooms.length < 2) return [];
  if (rooms.length === 2) {
    const [r0, r1] = rooms;
    return [{ a: r0.id, b: r1.id, weight: Math.hypot(r0.cx - r1.cx, r0.cy - r1.cy) }];
  }
  const points = rooms.flatMap((r) => [r.cx, r.cy]);
  const delaunay = new Delaunator(points);
  const edgeSet = /* @__PURE__ */ new Map();
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
var init_triangulate = __esm({
  "../core/src/stages/02-triangulate.js"() {
    init_delaunator();
  }
});

// ../core/src/stages/03-spanning-tree.js
function spanningTree(rooms, edges) {
  if (rooms.length === 0) return [];
  const adjacency = new Map(rooms.map((r) => [r.id, []]));
  for (const e of edges) {
    adjacency.get(e.a).push(e);
    adjacency.get(e.b).push(e);
  }
  const visited = /* @__PURE__ */ new Set([rooms[0].id]);
  const frontier = [...adjacency.get(rooms[0].id)];
  const mst = [];
  while (visited.size < rooms.length && frontier.length > 0) {
    frontier.sort((x, y) => x.weight - y.weight);
    const edge = frontier.shift();
    const otherEnd = visited.has(edge.a) ? edge.b : visited.has(edge.b) ? edge.a : null;
    if (otherEnd === null || visited.has(otherEnd)) continue;
    visited.add(otherEnd);
    mst.push({ a: edge.a, b: edge.b, weight: edge.weight, kind: "mst" });
    frontier.push(...adjacency.get(otherEnd).filter((e) => {
      const far = e.a === otherEnd ? e.b : e.a;
      return !visited.has(far);
    }));
  }
  return mst;
}
var init_spanning_tree = __esm({
  "../core/src/stages/03-spanning-tree.js"() {
  }
});

// ../core/src/stages/04-add-cycles.js
function addCycles(allEdges, mstEdges, cycleRate, rng) {
  const mstKeys = new Set(mstEdges.map((e) => `${e.a}-${e.b}`));
  const result = [...mstEdges];
  for (const edge of allEdges) {
    const key = `${edge.a}-${edge.b}`;
    if (mstKeys.has(key)) continue;
    if (rng.chance(cycleRate)) {
      result.push({ a: edge.a, b: edge.b, weight: edge.weight, kind: "cycle" });
    }
  }
  return result;
}
var init_add_cycles = __esm({
  "../core/src/stages/04-add-cycles.js"() {
  }
});

// ../core/src/stages/05-vertical-links.js
function footprintFree(grid, x, y, floor, width, height) {
  for (let dy = 0; dy < LINK_H; dy++) {
    for (let dx = 0; dx < LINK_W; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (!inBounds(cx, cy, floor, width, height, floor + 1)) return false;
      if (getCell(grid, cx, cy, floor, width, height) !== CELL.EMPTY) return false;
    }
  }
  return true;
}
function overlapsAnyRoomBbox(x, y, floorRooms) {
  for (const room of floorRooms) {
    if (x < room.x + room.w && x + LINK_W > room.x && y < room.y + room.h && y + LINK_H > room.y) {
      return true;
    }
  }
  return false;
}
function rectGap(fx, fy, fw, fh, room) {
  const dx = Math.max(room.x - (fx + fw), fx - (room.x + room.w), 0);
  const dy = Math.max(room.y - (fy + fh), fy - (room.y + room.h), 0);
  return Math.max(dx, dy);
}
function nearestRoomGap(fx, fy, floorRooms) {
  let best = Infinity;
  for (const room of floorRooms) {
    const gap = rectGap(fx, fy, LINK_W, LINK_H, room);
    if (gap < best) best = gap;
  }
  return best;
}
function nearestRoom(cx, cy, floorRooms) {
  let best = null;
  let bestDist = Infinity;
  for (const room of floorRooms) {
    const d = Math.hypot(room.cx - cx, room.cy - cy);
    if (d < bestDist) {
      bestDist = d;
      best = room;
    }
  }
  return best;
}
function collectCandidates(grid, width, height, floorA, floorB, roomsA, roomsB) {
  const candidates = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!footprintFree(grid, x, y, floorA, width, height)) continue;
      if (!footprintFree(grid, x, y, floorB, width, height)) continue;
      if (overlapsAnyRoomBbox(x, y, roomsA)) continue;
      if (overlapsAnyRoomBbox(x, y, roomsB)) continue;
      if (nearestRoomGap(x, y, roomsA) > MAX_ROOM_GAP) continue;
      if (nearestRoomGap(x, y, roomsB) > MAX_ROOM_GAP) continue;
      candidates.push({ x, y, cx: x + LINK_W / 2, cy: y + LINK_H / 2 });
    }
  }
  return candidates;
}
function verticalLinks(grid, width, height, floors, rooms, verticalLinksPerGap, rng) {
  const links = [];
  const edges = [];
  const minSeparation = Math.min(width, height) / 3;
  let nextId = 0;
  for (let floorA = 0; floorA < floors - 1; floorA++) {
    const floorB = floorA + 1;
    const roomsA = rooms.filter((r) => r.floor === floorA);
    const roomsB = rooms.filter((r) => r.floor === floorB);
    let candidates = collectCandidates(grid, width, height, floorA, floorB, roomsA, roomsB);
    if (candidates.length === 0) {
      throw new Error(
        `verticalLinks: no valid footprint between floor ${floorA} and floor ${floorB} \u2014 every floor pair must have at least one candidate within ${MAX_ROOM_GAP} cells of a room on both sides (SPEC.md \xA75.7 invariant).`
      );
    }
    const chosen = [rng.pick(candidates)];
    for (let i = 1; i < verticalLinksPerGap; i++) {
      const remaining = candidates.filter(
        (c) => chosen.every((picked) => Math.hypot(c.cx - picked.cx, c.cy - picked.cy) >= minSeparation)
      );
      if (remaining.length === 0) break;
      chosen.push(rng.pick(remaining));
    }
    for (const footprint of chosen) {
      for (let dy = 0; dy < LINK_H; dy++) {
        for (let dx = 0; dx < LINK_W; dx++) {
          setCell(grid, footprint.x + dx, footprint.y + dy, floorA, width, height, CELL.STAIR);
          setCell(grid, footprint.x + dx, footprint.y + dy, floorB, width, height, CELL.STAIR);
        }
      }
      const roomFrom = nearestRoom(footprint.cx, footprint.cy, roomsA);
      const roomTo = nearestRoom(footprint.cx, footprint.cy, roomsB);
      const id = nextId++;
      links.push({
        id,
        fromFloor: floorA,
        toFloor: floorB,
        x: footprint.x,
        y: footprint.y,
        w: LINK_W,
        h: LINK_H,
        kind: "stair",
        roomIdFrom: roomFrom.id,
        roomIdTo: roomTo.id
      });
      edges.push({
        a: roomFrom.id,
        b: roomTo.id,
        weight: Math.hypot(roomFrom.cx - roomTo.cx, roomFrom.cy - roomTo.cy),
        kind: "vertical"
      });
    }
  }
  return { links, edges };
}
var LINK_W, LINK_H, MAX_ROOM_GAP;
var init_vertical_links = __esm({
  "../core/src/stages/05-vertical-links.js"() {
    init_grid();
    LINK_W = 2;
    LINK_H = 1;
    MAX_ROOM_GAP = 3;
  }
});

// ../core/src/stages/06-carve.js
function roomBoundaryCell(room, roomIdAt, width, height, floor) {
  const cx = Math.round(room.cx);
  const cy = Math.round(room.cy);
  if (!roomIdAt || getRoomId(roomIdAt, cx, cy, floor, width, height) === room.id) {
    return { x: cx, y: cy };
  }
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (getRoomId(roomIdAt, x, y, floor, width, height) === room.id) {
        return { x, y };
      }
    }
  }
  return { x: cx, y: cy };
}
function cellCost(cellValue, costs) {
  switch (cellValue) {
    case CELL.EMPTY:
      return costs.newHallway;
    case CELL.HALLWAY:
      return costs.reuseHallway;
    case CELL.ROOM:
      return costs.throughRoom;
    case CELL.STAIR:
      return costs.reuseHallway;
    default:
      return Infinity;
  }
}
function astar(grid, width, height, floor, start, goal, costs) {
  const key = (x, y) => `${x},${y}`;
  const open = /* @__PURE__ */ new Map([[key(start.x, start.y), { x: start.x, y: start.y, dir: null }]]);
  const cameFrom = /* @__PURE__ */ new Map();
  const gScore = /* @__PURE__ */ new Map([[key(start.x, start.y), 0]]);
  const fScore = /* @__PURE__ */ new Map([[key(start.x, start.y), Math.hypot(goal.x - start.x, goal.y - start.y)]]);
  const dirs = [
    { dx: 1, dy: 0, name: "e" },
    { dx: -1, dy: 0, name: "w" },
    { dx: 0, dy: 1, name: "s" },
    { dx: 0, dy: -1, name: "n" }
  ];
  while (open.size > 0) {
    let currentKey = null;
    let currentF = Infinity;
    for (const [k, node] of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentKey = k;
      }
    }
    const current = open.get(currentKey);
    open.delete(currentKey);
    if (current.x === goal.x && current.y === goal.y) {
      const path = [current];
      let k = currentKey;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k);
        path.unshift(prev);
        k = key(prev.x, prev.y);
      }
      return path;
    }
    for (const d of dirs) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;
      if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
      const cellValue = getCell(grid, nx, ny, floor, width, height);
      const stepCost = cellCost(cellValue, costs);
      if (!Number.isFinite(stepCost)) continue;
      const turnPenalty = current.dir && current.dir !== d.name ? costs.turn : 0;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost + turnPenalty;
      const nKey = key(nx, ny);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + Math.hypot(goal.x - nx, goal.y - ny));
        open.set(nKey, { x: nx, y: ny, dir: d.name });
      }
    }
  }
  return null;
}
function carvePath(grid, width, height, floor, path) {
  for (const node of path) {
    if (getCell(grid, node.x, node.y, floor, width, height) === CELL.EMPTY) {
      setCell(grid, node.x, node.y, floor, width, height, CELL.HALLWAY);
    }
  }
}
function carve(grid, width, height, floor, rooms, edges, costs, links = [], roomIdAt = null) {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const mst = edges.filter((e) => e.kind === "mst");
  const cycles = edges.filter((e) => e.kind === "cycle");
  for (const edge of [...mst, ...cycles]) {
    const roomA = roomsById.get(edge.a);
    const roomB = roomsById.get(edge.b);
    const start = roomBoundaryCell(roomA, roomIdAt, width, height, floor);
    const goal = roomBoundaryCell(roomB, roomIdAt, width, height, floor);
    const path = astar(grid, width, height, floor, start, goal, costs);
    if (!path) continue;
    carvePath(grid, width, height, floor, path);
  }
  for (const link of links) {
    if (link.fromFloor !== floor && link.toFloor !== floor) continue;
    const roomId = link.fromFloor === floor ? link.roomIdFrom : link.roomIdTo;
    const room = roomsById.get(roomId);
    if (!room) continue;
    const start = roomBoundaryCell(room, roomIdAt, width, height, floor);
    const goal = { x: link.x, y: link.y };
    const path = astar(grid, width, height, floor, start, goal, costs);
    if (!path) continue;
    carvePath(grid, width, height, floor, path);
  }
}
function thickenCorridors(grid, width, height, floor, residualCells) {
  for (const cell of residualCells) {
    const x0 = Math.max(0, cell.x);
    const y0 = Math.max(0, cell.y);
    const x1 = Math.min(width, cell.x + cell.w);
    const y1 = Math.min(height, cell.y + cell.h);
    if (x0 >= x1 || y0 >= y1) continue;
    let touchesCorridor = false;
    for (let y = y0; y < y1 && !touchesCorridor; y++) {
      for (let x = x0; x < x1; x++) {
        if (getCell(grid, x, y, floor, width, height) === CELL.HALLWAY) {
          touchesCorridor = true;
          break;
        }
      }
    }
    if (!touchesCorridor) continue;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (getCell(grid, x, y, floor, width, height) === CELL.EMPTY) {
          setCell(grid, x, y, floor, width, height, CELL.HALLWAY);
        }
      }
    }
  }
}
var init_carve = __esm({
  "../core/src/stages/06-carve.js"() {
    init_grid();
  }
});

// ../core/src/stages/07-prune.js
function isWalkable(value) {
  return value === CELL.ROOM || value === CELL.HALLWAY || value === CELL.STAIR;
}
function isProtected(value) {
  return value === CELL.ROOM || value === CELL.STAIR;
}
function prune(grid, width, height, floor, iterations) {
  for (let iter = 0; iter < iterations; iter++) {
    const toRemove = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (getCell(grid, x, y, floor, width, height) !== CELL.HALLWAY) continue;
        let walkableNeighbors = 0;
        let protectedNeighbor = false;
        for (const { dx, dy } of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny, floor, width, height, floor + 1)) continue;
          const value = getCell(grid, nx, ny, floor, width, height);
          if (isWalkable(value)) walkableNeighbors++;
          if (isProtected(value)) protectedNeighbor = true;
        }
        if (walkableNeighbors === 1 && !protectedNeighbor) {
          toRemove.push({ x, y });
        }
      }
    }
    if (toRemove.length === 0) break;
    for (const { x, y } of toRemove) {
      setCell(grid, x, y, floor, width, height, CELL.EMPTY);
    }
  }
}
var DIRS;
var init_prune = __esm({
  "../core/src/stages/07-prune.js"() {
    init_grid();
    DIRS = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];
  }
});

// ../core/src/stages/08-mission.js
function buildAdjacency(rooms, edges) {
  const adj = new Map(rooms.map((r) => [r.id, []]));
  for (const e of edges) {
    adj.get(e.a).push({ to: e.b, kind: e.kind });
    adj.get(e.b).push({ to: e.a, kind: e.kind });
  }
  return adj;
}
function bfsDistances(adj, startId, edgeFilter = () => true) {
  const dist2 = /* @__PURE__ */ new Map([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    for (const { to, kind } of adj.get(cur)) {
      if (!edgeFilter(kind)) continue;
      if (!dist2.has(to)) {
        dist2.set(to, dist2.get(cur) + 1);
        queue.push(to);
      }
    }
  }
  return dist2;
}
function bfsPath(adj, startId, targetId) {
  const prev = /* @__PURE__ */ new Map([[startId, null]]);
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
  while (node !== null && node !== void 0) {
    path.unshift(node);
    node = prev.get(node) ?? null;
    if (node === startId) {
      path.unshift(startId);
      break;
    }
  }
  return path;
}
function mission(rooms, edges, links = []) {
  const adj = buildAdjacency(rooms, edges);
  const degree = new Map(rooms.map((r) => [r.id, adj.get(r.id).length]));
  const leaves = rooms.filter((r) => degree.get(r.id) === 1);
  const highestFloor = Math.min(...rooms.map((r) => r.floor));
  const topFloorLeaves = leaves.filter((r) => r.floor === highestFloor);
  const pool = topFloorLeaves.length > 0 ? topFloorLeaves : leaves.length > 0 ? leaves : rooms;
  const centroidX = rooms.reduce((s, r) => s + r.cx, 0) / rooms.length;
  const centroidY = rooms.reduce((s, r) => s + r.cy, 0) / rooms.length;
  const mstReachSize = /* @__PURE__ */ new Map();
  for (const candidate of pool) {
    const reach = bfsDistances(adj, candidate.id, (kind) => kind === "mst");
    mstReachSize.set(candidate.id, reach.size);
  }
  const byReachThenCentroid = [...pool].sort((a, b) => {
    const reachA = mstReachSize.get(a.id) ?? -1;
    const reachB = mstReachSize.get(b.id) ?? -1;
    if (reachA !== reachB) return reachB - reachA;
    const da2 = Math.hypot(a.cx - centroidX, a.cy - centroidY);
    const db = Math.hypot(b.cx - centroidX, b.cy - centroidY);
    return db - da2 || a.id - b.id;
  });
  const entrance = byReachThenCentroid[0];
  const distFromEntrance = bfsDistances(adj, entrance.id);
  const structuralDegree = new Map(rooms.map((r) => [r.id, 0]));
  for (const r of rooms) {
    structuralDegree.set(r.id, adj.get(r.id).filter((e) => e.kind !== "cycle").length);
  }
  const treasureIds = /* @__PURE__ */ new Set();
  for (const r of rooms) {
    if (r.id === entrance.id) continue;
    if (structuralDegree.get(r.id) === 1 && degree.get(r.id) >= 2) {
      treasureIds.add(r.id);
      r.role = "treasure";
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
      r.role = "entrance";
    } else if (r.role === "treasure") {
    } else if (r.id === climax.id) {
      r.role = "climax";
    } else if (degree.get(r.id) >= 3) {
      r.role = "junction";
    } else {
      r.role = "filler";
    }
  }
  const path = bfsPath(adj, entrance.id, climax.id);
  const criticalLinks = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const link = links.find(
      (l) => l.roomIdFrom === a && l.roomIdTo === b || l.roomIdFrom === b && l.roomIdTo === a
    );
    if (link) criticalLinks.push(link.id);
  }
  return {
    entranceRoomId: entrance.id,
    climaxRoomId: climax.id,
    path,
    criticalLinks,
    optionalBranches: []
  };
}
function assignSecretDoors(rooms, doors) {
  const doorsById = new Map(doors.map((d) => [d.id, d]));
  for (const room of rooms) {
    if (room.role !== "treasure" || room.doors.length < 2) continue;
    const door = doorsById.get(room.doors[room.doors.length - 1]);
    if (door) door.secret = true;
  }
}
var init_mission = __esm({
  "../core/src/stages/08-mission.js"() {
  }
});

// ../core/src/stages/09-key.js
function formatLabel(scheme, floor, number, padTo) {
  const padded = String(number).padStart(padTo, "0");
  if (scheme === "flat") return String(number);
  if (scheme === "alpha-floor") {
    const letter = String.fromCharCode("A".charCodeAt(0) + floor);
    return `${letter}${number}`;
  }
  return `${floor + 1}-${padded}`;
}
function buildAdjacency2(rooms, adjacency) {
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
function bfsOrder(rooms, adjacency, links, entranceRoomId) {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const sameFloorAdj = buildAdjacency2(rooms, adjacency);
  const verticalAdj = buildAdjacency2(rooms, links.map((l) => ({ a: l.roomIdFrom, b: l.roomIdTo })));
  const order = [];
  const seen = /* @__PURE__ */ new Set([entranceRoomId]);
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
  for (const r of rooms) {
    if (!seen.has(r.id)) order.push(r.id);
  }
  return order;
}
function exitsFor(room, doorsById, links, labelByRoomId) {
  const exits = [];
  for (const doorId of room.doors) {
    const door = doorsById.get(doorId);
    if (!door || door.toRoomId == null) continue;
    const toLabel = labelByRoomId.get(door.toRoomId);
    if (toLabel === void 0) continue;
    exits.push({ dir: door.dir, toLabel, via: door.secret ? "secret" : "door" });
  }
  for (const link of links) {
    if (link.roomIdFrom === room.id) {
      exits.push({ dir: "down", toLabel: labelByRoomId.get(link.roomIdTo), via: "stair" });
    }
    if (link.roomIdTo === room.id) {
      exits.push({ dir: "up", toLabel: labelByRoomId.get(link.roomIdFrom), via: "stair" });
    }
  }
  return exits;
}
function synchronizeExits(areas) {
  const areasByLabel = new Map(areas.map((a) => [a.label, a]));
  for (const area of areas) {
    for (const exit of [...area.exits]) {
      if (exit.via === "stair") continue;
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
  const exitLines = exitsInEntries ? exits.map((e) => `${e.dir.toUpperCase()} \u2192 ${e.toLabel}`).join(", ") : "";
  switch (role) {
    case "entrance":
      return `Aponta as sa\xEDdas e o que se v\xEA do umbral. ${exitLines}`.trim();
    case "climax":
      return `Ponto mais distante da entrada. ${exitLines}`.trim();
    case "treasure": {
      const secretNote = hasSecretDoor ? " Uma das entradas \xE9 secreta." : "";
      return `Ramo opcional, alcan\xE7\xE1vel s\xF3 por um caminho alternativo.${secretNote} ${exitLines}`.trim();
    }
    case "junction":
      return `Encruzilhada com ${exits.length} sa\xEDdas. ${exitLines}`.trim();
    default:
      return exitLines;
  }
}
function buildKey(rooms, adjacency, entranceRoomId, keyConfig, links = [], doors = []) {
  const order = bfsOrder(rooms, adjacency, links, entranceRoomId);
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const numberedIds = order;
  const labelByRoomId = /* @__PURE__ */ new Map();
  const floorCounters = /* @__PURE__ */ new Map();
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
      exits: exitsFor(r, doorsById, links, labelByRoomId)
    };
  });
  synchronizeExits(areas);
  const entries = areas.map((area) => {
    const room = roomsById.get(area.roomId);
    const title = TITLE_BY_ROLE[room.role] ?? `\xC1rea ${area.label}`;
    const hasSecretDoor = room.doors.some((id) => doorsById.get(id)?.secret);
    return {
      areaId: area.id,
      label: area.label,
      title,
      description: descriptionFor(room.role, area.exits, keyConfig.exitsInEntries, hasSecretDoor),
      tags: [room.role]
    };
  });
  const rolesPresent = new Set(rooms.map((r) => r.role));
  const legend = Object.entries(LEGEND_BY_ROLE).filter(([role]) => rolesPresent.has(role)).map(([, symbol]) => ({ ...symbol }));
  legend.push({ kind: "area", caption: "\xC1rea sem papel especial" });
  if (links.length > 0) {
    legend.push({ kind: "stairUp", caption: "Escada subindo" });
    legend.push({ kind: "stairDown", caption: "Escada descendo" });
  }
  if (doors.some((d) => d.secret)) {
    legend.push({ kind: "secret", caption: "Porta secreta" });
  }
  const byLabel = Object.fromEntries(areas.map((a) => [a.label, a.id]));
  return {
    areas,
    key: {
      scheme: keyConfig.scheme,
      entries,
      legend,
      byLabel
    }
  };
}
var TITLE_BY_ROLE, LEGEND_BY_ROLE, OPPOSITE_DIR;
var init_key = __esm({
  "../core/src/stages/09-key.js"() {
    TITLE_BY_ROLE = {
      entrance: "Entrada",
      climax: "C\xE2mara final",
      treasure: "C\xE2mara isolada",
      junction: "Encruzilhada",
      filler: null
      // filled per-area below: "Área {label}"
    };
    LEGEND_BY_ROLE = {
      entrance: { kind: "entrance", caption: "Entrada da masmorra" },
      climax: { kind: "climax", caption: "C\xE2mara final" },
      treasure: { kind: "treasure", caption: "C\xE2mara de tesouro opcional" },
      junction: { kind: "junction", caption: "Encruzilhada" }
    };
    OPPOSITE_DIR = { n: "s", s: "n", e: "w", w: "e", up: "down", down: "up" };
  }
});

// ../core/src/stages/10-extract-walls.js
function isWalkable2(value) {
  return value === CELL.ROOM || value === CELL.HALLWAY || value === CELL.STAIR;
}
function cellValueAt(grid, x, y, floor, width, height) {
  if (!inBounds(x, y, floor, width, height, floor + 1)) return CELL.EMPTY;
  return getCell(grid, x, y, floor, width, height);
}
function collectSilhouetteEdges(grid, width, height, floor) {
  const horizontal = [];
  const vertical = [];
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      const above = cellValueAt(grid, x, y - 1, floor, width, height);
      const below = cellValueAt(grid, x, y, floor, width, height);
      if (isWalkable2(above) !== isWalkable2(below)) {
        horizontal.push({ x, y });
      }
    }
  }
  for (let x = 0; x <= width; x++) {
    for (let y = 0; y < height; y++) {
      const left = cellValueAt(grid, x - 1, y, floor, width, height);
      const right = cellValueAt(grid, x, y, floor, width, height);
      if (isWalkable2(left) !== isWalkable2(right)) {
        vertical.push({ x, y });
      }
    }
  }
  return { horizontal, vertical };
}
function isDoorOpening(cellValue) {
  return cellValue === CELL.HALLWAY || cellValue === CELL.STAIR;
}
function roomIdAtCell(roomIdAt, x, y, floor, width, height) {
  if (!inBounds(x, y, floor, width, height, floor + 1)) return null;
  const id = getRoomId(roomIdAt, x, y, floor, width, height);
  return id === NO_ROOM ? null : id;
}
function collectDoorEdges(grid, roomIdAt, width, height, floor, rooms) {
  const horizontal = [];
  const vertical = [];
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (roomIdAtCell(roomIdAt, x, y, floor, width, height) !== room.id) continue;
        for (const { dx, dy, dir } of DOOR_NEIGHBORS) {
          const ox = x + dx;
          const oy = y + dy;
          if (roomIdAtCell(roomIdAt, ox, oy, floor, width, height) === room.id) continue;
          const outsideValue = cellValueAt(grid, ox, oy, floor, width, height);
          if (!isDoorOpening(outsideValue)) continue;
          const toRoomId = traceDestinationRoom(grid, roomIdAt, width, height, floor, room.id, { x: ox, y: oy });
          const fuseGroup = `${room.id}:${toRoomId}:${dir}`;
          if (dir === "n" || dir === "s") {
            horizontal.push({ x, y: dir === "s" ? y + 1 : y, roomId: room.id, toRoomId, fuseGroup });
          } else {
            vertical.push({ x: dir === "e" ? x + 1 : x, y, roomId: room.id, toRoomId, fuseGroup });
          }
        }
      }
    }
  }
  return { horizontal, vertical };
}
function fuseRuns(edges, axisKey, positionKey, groupKey) {
  const segments = [];
  let run = null;
  for (const edge of edges) {
    const group = groupKey ? edge[groupKey] : void 0;
    if (run && run.axis === edge[axisKey] && run.group === group && edge[positionKey] === run.end) {
      run.end = edge[positionKey] + 1;
    } else {
      if (run) segments.push(run);
      run = { axis: edge[axisKey], start: edge[positionKey], end: edge[positionKey] + 1, group };
    }
  }
  if (run) segments.push(run);
  return segments;
}
function traceDestinationRoom(grid, roomIdAt, width, height, floor, originRoomId, start) {
  const startValue = cellValueAt(grid, start.x, start.y, floor, width, height);
  if (startValue === CELL.ROOM) {
    const id = roomIdAtCell(roomIdAt, start.x, start.y, floor, width, height);
    return id !== null && id !== originRoomId ? id : null;
  }
  const seen = /* @__PURE__ */ new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !inBounds(nx, ny, floor, width, height, floor + 1)) continue;
      seen.add(key);
      const v2 = getCell(grid, nx, ny, floor, width, height);
      if (v2 === CELL.ROOM) {
        const id = roomIdAtCell(roomIdAt, nx, ny, floor, width, height);
        if (id !== null && id !== originRoomId) return id;
        continue;
      }
      if (v2 === CELL.HALLWAY || v2 === CELL.STAIR) queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
function extractWalls(grid, roomIdAt, width, height, floor, rooms) {
  const silhouette = collectSilhouetteEdges(grid, width, height, floor);
  silhouette.horizontal.sort((a, b) => a.y - b.y || a.x - b.x);
  silhouette.vertical.sort((a, b) => a.x - b.x || a.y - b.y);
  const hWalls = fuseRuns(silhouette.horizontal, "y", "x", null).map((s) => ({
    floor,
    x1: s.start,
    y1: s.axis,
    x2: s.end,
    y2: s.axis,
    isDoor: false,
    doorId: null
  }));
  const vWalls = fuseRuns(silhouette.vertical, "x", "y", null).map((s) => ({
    floor,
    x1: s.axis,
    y1: s.start,
    x2: s.axis,
    y2: s.end,
    isDoor: false,
    doorId: null
  }));
  const doorEdges = collectDoorEdges(grid, roomIdAt, width, height, floor, rooms);
  doorEdges.horizontal.sort((a, b) => a.y - b.y || a.x - b.x);
  doorEdges.vertical.sort((a, b) => a.x - b.x || a.y - b.y);
  function parseFuseGroup(group) {
    const [roomIdStr, toRoomIdStr, dir] = group.split(":");
    return { roomId: Number(roomIdStr), toRoomId: toRoomIdStr === "null" ? null : Number(toRoomIdStr), dir };
  }
  const hDoorSegments = fuseRuns(doorEdges.horizontal, "y", "x", "fuseGroup").map((s) => ({
    floor,
    x1: s.start,
    y1: s.axis,
    x2: s.end,
    y2: s.axis,
    isDoor: true,
    doorId: null,
    ...parseFuseGroup(s.group)
  }));
  const vDoorSegments = fuseRuns(doorEdges.vertical, "x", "y", "fuseGroup").map((s) => ({
    floor,
    x1: s.axis,
    y1: s.start,
    x2: s.axis,
    y2: s.end,
    isDoor: true,
    doorId: null,
    ...parseFuseGroup(s.group)
  }));
  const doorWalls = [...hDoorSegments, ...vDoorSegments];
  let nextDoorId = 0;
  const doors = [];
  for (const wall of doorWalls) {
    const doorId = nextDoorId++;
    wall.doorId = doorId;
    doors.push({
      id: doorId,
      floor,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      roomId: wall.roomId,
      secret: false,
      dir: wall.dir,
      toRoomId: wall.toRoomId
    });
  }
  const doorsByRoom = /* @__PURE__ */ new Map();
  for (const d of doors) {
    if (!doorsByRoom.has(d.roomId)) doorsByRoom.set(d.roomId, []);
    doorsByRoom.get(d.roomId).push(d.id);
  }
  for (const room of rooms) {
    room.doors = doorsByRoom.get(room.id) ?? [];
  }
  const publicDoorWalls = doorWalls.map(({ roomId, toRoomId, dir, ...rest }) => rest);
  const walls = [...hWalls, ...vWalls, ...publicDoorWalls];
  return { walls, doors };
}
var DOOR_NEIGHBORS;
var init_extract_walls = __esm({
  "../core/src/stages/10-extract-walls.js"() {
    init_grid();
    DOOR_NEIGHBORS = [
      { dx: 0, dy: -1, dir: "n" },
      { dx: 0, dy: 1, dir: "s" },
      { dx: -1, dy: 0, dir: "w" },
      { dx: 1, dy: 0, dir: "e" }
    ];
  }
});

// ../core/src/validate.js
var init_validate = __esm({
  "../core/src/validate.js"() {
    init_grid();
  }
});

// ../core/src/pipeline.js
function separateClampedRooms(floorRooms, width, height) {
  for (let pass = 0; pass < 60; pass++) {
    let anyOverlap = false;
    for (const a of floorRooms) {
      let pushX = 0;
      let pushY = 0;
      for (const b of floorRooms) {
        if (a === b) continue;
        const dx = a.x + a.w / 2 - (b.x + b.w / 2);
        const dy = a.y + a.h / 2 - (b.y + b.h / 2);
        const overlapX = (a.w + b.w) / 2 + 1 - Math.abs(dx);
        const overlapY = (a.h + b.h) / 2 + 1 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          anyOverlap = true;
          const dist2 = Math.hypot(dx, dy) || 1e-4;
          pushX += dx / dist2 * overlapX * 0.5;
          pushY += dy / dist2 * overlapY * 0.5;
        }
      }
      const stepX = pushX === 0 ? 0 : Math.sign(pushX) * Math.max(1, Math.round(Math.abs(pushX)));
      const stepY = pushY === 0 ? 0 : Math.sign(pushY) * Math.max(1, Math.round(Math.abs(pushY)));
      a.x = Math.max(0, Math.min(a.x + stepX, width - a.w));
      a.y = Math.max(0, Math.min(a.y + stepY, height - a.h));
    }
    if (!anyOverlap) break;
  }
  for (const room of floorRooms) {
    room.cx = room.x + room.w / 2;
    room.cy = room.y + room.h / 2;
  }
}
function generateDungeon(config) {
  const grid = createGrid(config.width, config.height, config.floors);
  const roomIdAt = createRoomIdGrid(config.width, config.height, config.floors);
  const rooms = [];
  const edges = [];
  const residualCellsByFloor = [];
  let nextRoomId = 0;
  for (let floor = 0; floor < config.floors; floor++) {
    const { rooms: floorRooms, residualCells } = placeRooms(
      config.rooms,
      floor,
      deriveRng(config.seed, `place-rooms:${floor}`)
    );
    for (const room of floorRooms) {
      room.id = nextRoomId++;
      room.x = Math.max(0, Math.min(room.x, config.width - room.w));
      room.y = Math.max(0, Math.min(room.y, config.height - room.h));
      room.cx = room.x + room.w / 2;
      room.cy = room.y + room.h / 2;
    }
    separateClampedRooms(floorRooms, config.width, config.height);
    for (const room of floorRooms) {
      for (const cell of rasterizeRoom(room)) {
        setCell(grid, cell.x, cell.y, floor, config.width, config.height, CELL.ROOM);
        setRoomId(roomIdAt, cell.x, cell.y, floor, config.width, config.height, room.id);
      }
    }
    const allEdges = triangulate(floorRooms);
    const mstEdges = spanningTree(floorRooms, allEdges);
    const floorEdges = addCycles(
      allEdges,
      mstEdges,
      config.cycleRate,
      deriveRng(config.seed, `add-cycles:${floor}`)
    );
    rooms.push(...floorRooms);
    edges.push(...floorEdges);
    residualCellsByFloor.push(residualCells);
  }
  const { links, edges: verticalEdges } = config.floors > 1 ? verticalLinks(
    grid,
    config.width,
    config.height,
    config.floors,
    rooms,
    config.verticalLinksPerGap,
    deriveRng(config.seed, "vertical-links")
  ) : { links: [], edges: [] };
  edges.push(...verticalEdges);
  const floorById = new Map(rooms.map((r) => [r.id, r.floor]));
  let doorIdOffset = 0;
  const walls = [];
  const doors = [];
  for (let floor = 0; floor < config.floors; floor++) {
    const floorRooms = rooms.filter((r) => r.floor === floor);
    const floorEdges = edges.filter(
      (e) => e.kind !== "vertical" && floorById.get(e.a) === floor && floorById.get(e.b) === floor
    );
    carve(grid, config.width, config.height, floor, floorRooms, floorEdges, config.carve, links, roomIdAt);
    thickenCorridors(grid, config.width, config.height, floor, residualCellsByFloor[floor]);
    prune(grid, config.width, config.height, floor, config.pruneIterations);
    const { walls: floorWalls, doors: floorDoors } = extractWalls(
      grid,
      roomIdAt,
      config.width,
      config.height,
      floor,
      floorRooms
    );
    for (const door of floorDoors) door.id += doorIdOffset;
    for (const wall of floorWalls) {
      if (wall.doorId !== null) wall.doorId += doorIdOffset;
    }
    for (const room of floorRooms) {
      room.doors = room.doors.map((id) => id + doorIdOffset);
    }
    doorIdOffset += floorDoors.length;
    walls.push(...floorWalls);
    doors.push(...floorDoors);
  }
  const missionResult = mission(rooms, edges, links);
  assignSecretDoors(rooms, doors);
  const roomAdjacency = edges.filter((e) => e.kind !== "vertical").map((e) => ({ a: e.a, b: e.b }));
  const { areas, key } = buildKey(
    rooms,
    roomAdjacency,
    missionResult.entranceRoomId,
    config.key,
    links,
    doors
  );
  return {
    config,
    seed: config.seed,
    width: config.width,
    height: config.height,
    floors: config.floors,
    cells: grid,
    roomIdAt,
    rooms,
    edges,
    links,
    doors,
    walls,
    mission: missionResult,
    areas,
    key
  };
}
var init_pipeline = __esm({
  "../core/src/pipeline.js"() {
    init_rng();
    init_grid();
    init_shapes();
    init_place_rooms();
    init_triangulate();
    init_spanning_tree();
    init_add_cycles();
    init_vertical_links();
    init_carve();
    init_prune();
    init_mission();
    init_key();
    init_extract_walls();
    init_validate();
  }
});

// src/shared/icons.js
function iconForRole(role) {
  return ROLE_ICON[role] ?? ROLE_ICON.filler;
}
var ROLE_ICON;
var init_icons = __esm({
  "src/shared/icons.js"() {
    ROLE_ICON = {
      entrance: "icons/svg/door-exit.svg",
      climax: "icons/svg/skull.svg",
      treasure: "icons/svg/chest.svg",
      junction: "icons/svg/pawprint.svg",
      filler: "icons/svg/village.svg"
    };
  }
});

// src/shared/geometry.js
function toPixel(cell, gridSize) {
  return cell * gridSize;
}
function buildWallData(wall, doorsById, gridSize) {
  const door = !wall.isDoor ? WALL_DOOR_NONE : doorsById.get(wall.doorId)?.secret ? WALL_DOOR_SECRET : WALL_DOOR_DOOR;
  return {
    c: [
      toPixel(wall.x1, gridSize),
      toPixel(wall.y1, gridSize),
      toPixel(wall.x2, gridSize),
      toPixel(wall.y2, gridSize)
    ],
    light: WALL_SENSE_NORMAL,
    move: WALL_SENSE_NORMAL,
    sight: WALL_SENSE_NORMAL,
    sound: WALL_SENSE_NORMAL,
    dir: WALL_DIR_BOTH,
    door,
    ds: WALL_DOOR_STATE_CLOSED
  };
}
function buildNoteData(area, gridSize, pageId, journalId, role) {
  return {
    entryId: journalId,
    pageId,
    x: toPixel(area.cx, gridSize),
    y: toPixel(area.cy, gridSize),
    text: area.label,
    fontSize: NOTE_FONT_SIZE,
    textAnchor: TEXT_ANCHOR_CENTER,
    texture: { src: iconForRole(role) },
    iconSize: Math.round(gridSize * NOTE_ICON_SCALE)
  };
}
function buildStairNoteData(link, floor, destinationArea, gridSize, pageId, journalId) {
  const goingDown = floor === link.fromFloor;
  const arrow = goingDown ? "\u2193" : "\u2191";
  return {
    entryId: journalId,
    pageId,
    x: toPixel(link.x + link.w / 2, gridSize),
    y: toPixel(link.y + link.h / 2, gridSize),
    text: `${arrow} ${destinationArea.label}`,
    fontSize: NOTE_FONT_SIZE,
    textAnchor: TEXT_ANCHOR_CENTER,
    texture: { src: STAIR_ICON },
    iconSize: Math.round(gridSize * NOTE_ICON_SCALE)
  };
}
var WALL_SENSE_NORMAL, WALL_DOOR_NONE, WALL_DOOR_DOOR, WALL_DOOR_SECRET, WALL_DOOR_STATE_CLOSED, WALL_DIR_BOTH, TEXT_ANCHOR_CENTER, NOTE_FONT_SIZE, NOTE_ICON_SCALE, STAIR_ICON;
var init_geometry = __esm({
  "src/shared/geometry.js"() {
    init_icons();
    WALL_SENSE_NORMAL = 20;
    WALL_DOOR_NONE = 0;
    WALL_DOOR_DOOR = 1;
    WALL_DOOR_SECRET = 2;
    WALL_DOOR_STATE_CLOSED = 0;
    WALL_DIR_BOTH = 0;
    TEXT_ANCHOR_CENTER = 0;
    NOTE_FONT_SIZE = 32;
    NOTE_ICON_SCALE = 0.6;
    STAIR_ICON = "icons/svg/upgrade.svg";
  }
});

// src/shared/key-journal.js
function pageNameForArea(area, entry) {
  return `${area.label} \u2014 ${entry.title}`;
}
function pageContentForArea(area, entry) {
  const exitsHtml = area.exits.length === 0 ? "<p><em>Sem sa\xEDdas.</em></p>" : `<ul>${area.exits.map((e) => `<li>${e.dir} \u2192 ${e.toLabel} (${e.via})</li>`).join("")}</ul>`;
  return `<p>${entry.description}</p>${exitsHtml}`;
}
function legendPageContent(legend) {
  const rows = legend.map((s) => `<li><strong>${s.kind}</strong>: ${s.caption}</li>`).join("");
  return `<ul>${rows}</ul>`;
}
async function createKeyJournal(dungeon, config) {
  const entriesByAreaId = new Map(dungeon.key.entries.map((e) => [e.areaId, e]));
  const areaPages = dungeon.areas.map((area) => {
    const entry = entriesByAreaId.get(area.id);
    return {
      name: pageNameForArea(area, entry),
      type: "text",
      text: { content: pageContentForArea(area, entry), format: JOURNAL_FORMAT_HTML }
    };
  });
  const legendPage = {
    name: "Legenda",
    type: "text",
    text: { content: legendPageContent(dungeon.key.legend), format: JOURNAL_FORMAT_HTML }
  };
  return JournalEntry.create({
    name: `Chave \u2014 ${config.seed}`,
    pages: [legendPage, ...areaPages]
  });
}
function mapAreaPagesById(journal, dungeon) {
  const entriesByAreaId = new Map(dungeon.key.entries.map((e) => [e.areaId, e]));
  const pageIdByName = new Map(journal.pages.contents.map((p) => [p.name, p.id]));
  const map = /* @__PURE__ */ new Map();
  for (const area of dungeon.areas) {
    const entry = entriesByAreaId.get(area.id);
    const pageId = pageIdByName.get(pageNameForArea(area, entry));
    map.set(area.id, pageId);
  }
  return map;
}
var JOURNAL_FORMAT_HTML;
var init_key_journal = __esm({
  "src/shared/key-journal.js"() {
    JOURNAL_FORMAT_HTML = 1;
  }
});

// src/v13.js
async function bestEffortDelete(docs) {
  await Promise.all(docs.map(async (doc) => {
    try {
      await doc.delete();
    } catch (deleteErr) {
      console.error("adapter-foundry: rollback delete failed", deleteErr);
    }
  }));
}
function sceneNameForFloor(dungeon, floor, config) {
  return `${config.seed} \u2014 Andar ${floor + 1}`;
}
function regionShapeForLink(link, gridSize) {
  return {
    type: "rectangle",
    x: link.x * gridSize,
    y: link.y * gridSize,
    width: link.w * gridSize,
    height: link.h * gridSize
  };
}
async function createFloorScenes(dungeon, config, pageIdByAreaId, journalId) {
  const gridSize = config.gridSize ?? 100;
  const doorsById = new Map((dungeon.doors ?? []).map((d) => [d.id, d]));
  const rolesByRoomId = new Map(dungeon.rooms.map((r) => [r.id, r.role]));
  const scenes = [];
  try {
    for (let floor = 0; floor < dungeon.floors; floor++) {
      const walls = dungeon.walls.filter((w) => w.floor === floor).map((w) => buildWallData(w, doorsById, gridSize));
      const notes = dungeon.areas.filter((a) => a.floor === floor).map((a) => {
        const pageId = pageIdByAreaId.get(a.id);
        const role = rolesByRoomId.get(a.roomId) ?? "filler";
        return buildNoteData(a, gridSize, pageId, journalId, role);
      });
      const regions = dungeon.links.filter((link) => link.fromFloor === floor || link.toFloor === floor).map((link) => ({
        name: `stair-${link.id}`,
        shapes: [regionShapeForLink(link, gridSize)],
        flags: { "dungeon-forge": { linkId: link.id } }
      }));
      const stairNotes = dungeon.links.filter((link) => link.fromFloor === floor || link.toFloor === floor).map((link) => {
        const destinationRoomId = floor === link.fromFloor ? link.roomIdTo : link.roomIdFrom;
        const destinationArea = dungeon.areas.find((a) => a.roomId === destinationRoomId);
        const pageId = pageIdByAreaId.get(destinationArea.id);
        return buildStairNoteData(link, floor, destinationArea, gridSize, pageId, journalId);
      });
      const scene = await Scene.create({
        name: sceneNameForFloor(dungeon, floor, config),
        width: dungeon.width * gridSize,
        height: dungeon.height * gridSize,
        grid: { size: gridSize, type: 1 },
        background: { src: null },
        padding: 0,
        walls,
        notes: [...notes, ...stairNotes],
        regions
      });
      scenes.push(scene);
    }
  } catch (err) {
    await bestEffortDelete(scenes);
    throw err;
  }
  return scenes;
}
async function wireStairRegionBehaviors(scenes, dungeon) {
  const regionByLinkId = /* @__PURE__ */ new Map();
  for (const scene of scenes) {
    for (const region of scene.regions.contents) {
      const linkId = region.flags?.["dungeon-forge"]?.linkId;
      if (linkId === void 0) continue;
      if (!regionByLinkId.has(linkId)) regionByLinkId.set(linkId, []);
      regionByLinkId.get(linkId).push(region);
    }
  }
  for (const link of dungeon.links) {
    const [regionA, regionB] = regionByLinkId.get(link.id) ?? [];
    if (!regionA || !regionB) continue;
    await regionA.createEmbeddedDocuments("RegionBehavior", [
      { name: "teleport", type: "teleportToken", system: { destination: regionB.uuid, choice: false } }
    ]);
    await regionB.createEmbeddedDocuments("RegionBehavior", [
      { name: "teleport", type: "teleportToken", system: { destination: regionA.uuid, choice: false } }
    ]);
  }
}
async function emitV13(dungeon, config) {
  const journal = await createKeyJournal(dungeon, config);
  try {
    const pageIdByAreaId = mapAreaPagesById(journal, dungeon);
    const scenes = await createFloorScenes(dungeon, config, pageIdByAreaId, journal.id);
    try {
      await wireStairRegionBehaviors(scenes, dungeon);
    } catch (err) {
      await bestEffortDelete(scenes);
      throw err;
    }
    return { journal, scenes };
  } catch (err) {
    try {
      await journal.delete();
    } catch (deleteErr) {
      console.error("adapter-foundry: rollback delete failed", deleteErr);
    }
    throw err;
  }
}
var init_v13 = __esm({
  "src/v13.js"() {
    init_geometry();
    init_key_journal();
  }
});

// src/shared/config-form.js
function shapesFromWeights(weights) {
  const shapes = SHAPE_WEIGHT_TYPES.map((type) => ({ type, weight: Number(weights?.[type] ?? 0) })).filter((entry) => entry.weight > 0);
  return shapes.length > 0 ? shapes : [{ type: "rect", weight: 1 }];
}
function weightsFromShapes(shapes) {
  const weights = Object.fromEntries(SHAPE_WEIGHT_TYPES.map((type) => [type, 0]));
  const source = shapes && shapes.length > 0 ? shapes : DEFAULT_CONFIG.rooms.shapes;
  for (const entry of source) {
    weights[entry.type] = entry.weight;
  }
  return weights;
}
function expandFlat(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split(".");
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor[parts[i]] ??= {};
      cursor = cursor[parts[i]];
    }
    cursor[parts.at(-1)] = value;
  }
  return result;
}
function configFromFormData(rawFormObject) {
  const formObject = expandFlat(rawFormObject);
  return {
    target: "v13",
    seed: formObject.seed || DEFAULT_CONFIG.seed,
    floors: Number(formObject.floors),
    width: Number(formObject.width),
    height: Number(formObject.height),
    gridSize: Number(formObject.gridSize),
    rooms: {
      count: Number(formObject.rooms.count),
      sizeMean: Number(formObject.rooms.sizeMean),
      sizeStdDev: Number(formObject.rooms.sizeStdDev),
      sizeMin: Number(formObject.rooms.sizeMin),
      sizeMax: Number(formObject.rooms.sizeMax),
      spawnRadius: Number(formObject.rooms.spawnRadius),
      separationIters: Number(formObject.rooms.separationIters),
      shapes: shapesFromWeights(formObject.shapeWeight)
    },
    cycleRate: Number(formObject.cycleRate),
    verticalLinksPerGap: Number(formObject.verticalLinksPerGap),
    carve: {
      newHallway: Number(formObject.carve.newHallway),
      reuseHallway: Number(formObject.carve.reuseHallway),
      throughRoom: Number(formObject.carve.throughRoom),
      turn: Number(formObject.carve.turn)
    },
    pruneIterations: Number(formObject.pruneIterations),
    key: {
      scheme: formObject.key.scheme,
      numberJunctions: Boolean(formObject.key.numberJunctions),
      startAt: Number(formObject.key.startAt),
      padTo: Number(formObject.key.padTo),
      exitsInEntries: Boolean(formObject.key.exitsInEntries)
    }
  };
}
function formDataFromConfig(config) {
  return {
    seed: config.seed,
    floors: config.floors,
    width: config.width,
    height: config.height,
    gridSize: config.gridSize,
    rooms: {
      count: config.rooms.count,
      sizeMean: config.rooms.sizeMean,
      sizeStdDev: config.rooms.sizeStdDev,
      sizeMin: config.rooms.sizeMin,
      sizeMax: config.rooms.sizeMax,
      spawnRadius: config.rooms.spawnRadius,
      separationIters: config.rooms.separationIters
    },
    shapeWeight: weightsFromShapes(config.rooms.shapes),
    cycleRate: config.cycleRate,
    verticalLinksPerGap: config.verticalLinksPerGap,
    carve: { ...config.carve },
    pruneIterations: config.pruneIterations,
    key: { ...config.key },
    schemeOptions: KEY_SCHEME_OPTIONS.map((opt) => ({ ...opt, selected: opt.value === config.key.scheme }))
  };
}
function nextRerollSeed(seed, rerollCount) {
  return `${seed}::reroll-${rerollCount}`;
}
var SHAPE_WEIGHT_TYPES, KEY_SCHEME_OPTIONS, DEFAULT_CONFIG;
var init_config_form = __esm({
  "src/shared/config-form.js"() {
    SHAPE_WEIGHT_TYPES = ["rect", "l", "cross", "circle", "triangle"];
    KEY_SCHEME_OPTIONS = [
      { value: "flat", label: "Flat" },
      { value: "per-floor", label: "Por andar" },
      { value: "alpha-floor", label: "Alfa por andar" }
    ];
    DEFAULT_CONFIG = {
      target: "v13",
      seed: "nova-masmorra",
      floors: 2,
      width: 50,
      height: 50,
      gridSize: 100,
      rooms: {
        count: 9,
        sizeMean: 7,
        sizeStdDev: 2.5,
        sizeMin: 3,
        sizeMax: 14,
        spawnRadius: 18,
        separationIters: 60,
        shapes: [{ type: "rect", weight: 1 }]
      },
      cycleRate: 0.25,
      verticalLinksPerGap: 2,
      carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
      pruneIterations: 8,
      key: { scheme: "per-floor", numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true }
    };
  }
});

// ../render/src/plan.js
var plan_exports = {};
__export(plan_exports, {
  buildRenderPlan: () => buildRenderPlan
});
function buildRenderPlan(dungeon, floor, gridSize) {
  const doorsById = new Map((dungeon.doors ?? []).map((d) => [d.id, d]));
  const wallLines = dungeon.walls.filter((w) => w.floor === floor).map((w) => ({
    x1: w.x1 * gridSize,
    y1: w.y1 * gridSize,
    x2: w.x2 * gridSize,
    y2: w.y2 * gridSize,
    isDoor: w.isDoor && !(w.doorId !== null && doorsById.get(w.doorId)?.secret)
  }));
  return {
    width: dungeon.width * gridSize,
    height: dungeon.height * gridSize,
    floorRects: [{ x: 0, y: 0, w: dungeon.width * gridSize, h: dungeon.height * gridSize }],
    wallLines
  };
}
var init_plan = __esm({
  "../render/src/plan.js"() {
  }
});

// ../render/src/draw.js
function drawPlanToContext(plan, ctx) {
  ctx.save();
  ctx.fillStyle = "#2a2a2a";
  for (const rect of plan.floorRects) {
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.lineWidth = 4;
  for (const line of plan.wallLines) {
    ctx.strokeStyle = line.isDoor ? "#c8963e" : "#0a0a0a";
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  ctx.restore();
}
async function renderFloor(dungeon, floor, gridSize) {
  const { buildRenderPlan: buildRenderPlan2 } = await Promise.resolve().then(() => (init_plan(), plan_exports));
  const plan = buildRenderPlan2(dungeon, floor, gridSize);
  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const ctx = canvas.getContext("2d");
  drawPlanToContext(plan, ctx);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return { floor, blob, width: plan.width, height: plan.height };
}
var init_draw = __esm({
  "../render/src/draw.js"() {
  }
});

// ../render/src/index.js
var init_src = __esm({
  "../render/src/index.js"() {
    init_plan();
    init_draw();
  }
});

// ../room-shape-ui/src/shape-editor.js
function defaultParamsFor(type) {
  const def = SHAPE_TYPES.find((s) => s.type === type);
  if (!def?.param) return {};
  return { [def.param.key]: def.param.options[0].value };
}
function smallRoomWarningApplies(type, w, h) {
  return type !== "rect" && type !== "custom" && (w < 4 || h < 4);
}
function cellsFromRoom(room) {
  return rasterizeRoom(room).map((cell) => [cell.x - room.x, cell.y - room.y]);
}
function toggleCustomCell(cells, room, x, y) {
  const dx = x - room.x;
  const dy = y - room.y;
  const idx = cells.findIndex(([cdx, cdy]) => cdx === dx && cdy === dy);
  if (idx === -1) return [...cells, [dx, dy]];
  if (cells.length === 1) return cells;
  return cells.filter((_, i) => i !== idx);
}
function isDisconnected(cells) {
  if (cells.length <= 1) return false;
  const key = (x, y) => `${x},${y}`;
  const set = new Set(cells.map(([x, y]) => key(x, y)));
  const seen = /* @__PURE__ */ new Set([key(cells[0][0], cells[0][1])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([nx, ny]);
      }
    }
  }
  return seen.size < cells.length;
}
function buildShapeEditorSVG(room, dungeon, gridSize, interactive = false) {
  const areaX = Math.max(0, room.x - CELL_PADDING);
  const areaY = Math.max(0, room.y - CELL_PADDING);
  const areaMaxX = Math.min(dungeon.width, room.x + room.w + CELL_PADDING);
  const areaMaxY = Math.min(dungeon.height, room.y + room.h + CELL_PADDING);
  const cols = areaMaxX - areaX;
  const rows = areaMaxY - areaY;
  if (!interactive) {
    const cells2 = rasterizeRoom(room).map((cell) => {
      const gx = cell.x - areaX;
      const gy = cell.y - areaY;
      return `<rect class="shape-cell-on" x="${gx * gridSize}" y="${gy * gridSize}" width="${gridSize}" height="${gridSize}" />`;
    }).join("");
    return `<svg class="shape-editor-svg" viewBox="0 0 ${cols * gridSize} ${rows * gridSize}" xmlns="http://www.w3.org/2000/svg">
      <rect class="shape-editor-bg" x="0" y="0" width="${cols * gridSize}" height="${rows * gridSize}" />
      ${cells2}
    </svg>`;
  }
  const onSet = new Set(rasterizeRoom(room).map((cell) => `${cell.x},${cell.y}`));
  let cells = "";
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = areaX + gx;
      const cy = areaY + gy;
      const on = onSet.has(`${cx},${cy}`);
      cells += `<rect class="shape-cell${on ? " shape-cell-on" : ""}" data-cx="${cx}" data-cy="${cy}"
        x="${gx * gridSize}" y="${gy * gridSize}" width="${gridSize}" height="${gridSize}" />`;
    }
  }
  return `<svg class="shape-editor-svg" viewBox="0 0 ${cols * gridSize} ${rows * gridSize}" xmlns="http://www.w3.org/2000/svg">
    ${cells}
  </svg>`;
}
function wireShapeEditorToggle(container, onToggle) {
  const svg = container.querySelector(".shape-editor-svg");
  if (!svg) return;
  for (const rect of svg.querySelectorAll(".shape-cell")) {
    rect.addEventListener("click", () => {
      onToggle(Number(rect.dataset.cx), Number(rect.dataset.cy));
    });
  }
}
function applyShapeType(room, type) {
  if (type === "custom") {
    room.shape = { type: "custom", params: { cells: cellsFromRoom(room) } };
    return;
  }
  const effective = smallRoomWarningApplies(type, room.w, room.h) ? "rect" : type;
  room.shape = { type: effective, params: defaultParamsFor(effective) };
}
function applyShapeParam(room, value) {
  if (!room.shape) return;
  const def = SHAPE_TYPES.find((s) => s.type === room.shape.type);
  if (!def?.param) return;
  room.shape = { type: room.shape.type, params: { [def.param.key]: value } };
}
function applySizeDelta(room, dungeon, dim, delta) {
  if (room.shape?.type === "custom") return;
  const max = dim === "w" ? dungeon.width - room.x : dungeon.height - room.y;
  const next = Math.max(1, Math.min(max, room[dim] + delta));
  if (next === room[dim]) return;
  room[dim] = next;
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
  const currentType = room.shape?.type ?? "rect";
  if (smallRoomWarningApplies(currentType, room.w, room.h)) {
    room.shape = { type: "rect", params: {} };
  }
}
function applyCustomToggle(room, x, y) {
  room.shape.params.cells = toggleCustomCell(room.shape.params.cells, room, x, y);
  const bounds = room.shape.params.cells.reduce(
    (acc, [dx, dy]) => ({
      minX: Math.min(acc.minX, dx),
      minY: Math.min(acc.minY, dy),
      maxX: Math.max(acc.maxX, dx),
      maxY: Math.max(acc.maxY, dy)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
  room.x += bounds.minX;
  room.y += bounds.minY;
  room.w = bounds.maxX - bounds.minX + 1;
  room.h = bounds.maxY - bounds.minY + 1;
  room.shape.params.cells = room.shape.params.cells.map(([dx, dy]) => [dx - bounds.minX, dy - bounds.minY]);
  room.cx = room.x + room.w / 2;
  room.cy = room.y + room.h / 2;
}
var CELL_PADDING, SHAPE_TYPES;
var init_shape_editor = __esm({
  "../room-shape-ui/src/shape-editor.js"() {
    init_pipeline();
    CELL_PADDING = 3;
    SHAPE_TYPES = [
      { type: "rect", label: "Ret\xE2ngulo", param: null },
      {
        type: "l",
        label: "L",
        param: {
          key: "corner",
          label: "Canto",
          options: [
            { value: "nw", label: "Noroeste" },
            { value: "ne", label: "Nordeste" },
            { value: "sw", label: "Sudoeste" },
            { value: "se", label: "Sudeste" }
          ]
        }
      },
      { type: "cross", label: "Cruz", param: null },
      { type: "circle", label: "C\xEDrculo", param: null },
      {
        type: "triangle",
        label: "Tri\xE2ngulo",
        param: {
          key: "orientation",
          label: "Orienta\xE7\xE3o",
          options: [
            { value: "up", label: "Cima" },
            { value: "down", label: "Baixo" },
            { value: "left", label: "Esquerda" },
            { value: "right", label: "Direita" }
          ]
        }
      },
      { type: "custom", label: "Come\xE7ar do zero (custom)", param: null }
    ];
  }
});

// src/shared/room-editor-context.js
function groupRoomsByFloor(rooms, areas, selectedRoomId) {
  const areaByRoomId = new Map(areas.map((a) => [a.roomId, a]));
  const byFloor = /* @__PURE__ */ new Map();
  for (const room of rooms) {
    if (!byFloor.has(room.floor)) byFloor.set(room.floor, []);
    byFloor.get(room.floor).push(room);
  }
  return [...byFloor.entries()].sort((a, b) => a[0] - b[0]).map(([floor, floorRooms]) => ({
    floor: floor + 1,
    rooms: floorRooms.map((room) => ({
      id: room.id,
      label: areaByRoomId.get(room.id)?.label ?? String(room.id),
      active: room.id === selectedRoomId
    }))
  }));
}
function buildWarningText(room, type) {
  if (type === "custom" && isDisconnected(room.shape.params.cells)) {
    return "C\xE9lulas desconectadas \u2014 pode gerar um corredor estranho at\xE9 aqui.";
  }
  if (smallRoomWarningApplies(type, room.w, room.h)) {
    return `Formas L/cruz/c\xEDrculo/tri\xE2ngulo exigem lado >= 4; esta sala (${room.w}x${room.h}) vira ret\xE2ngulo.`;
  }
  return null;
}
function buildDetailContext(room) {
  if (!room) return null;
  const type = room.shape?.type ?? "rect";
  const def = SHAPE_TYPES.find((s) => s.type === type);
  const selectedParam = room.shape?.params?.[def?.param?.key] ?? "";
  return {
    roomId: room.id,
    shapeTypes: SHAPE_TYPES.map((s) => ({ ...s, selected: s.type === type })),
    selectedType: type,
    hasParam: !!def?.param,
    paramLabel: def?.param?.label ?? "",
    paramOptions: (def?.param?.options ?? []).map((o) => ({ ...o, selected: o.value === selectedParam })),
    w: room.w,
    h: room.h,
    sizeSteppersDisabled: type === "custom",
    warning: buildWarningText(room, type)
  };
}
var init_room_editor_context = __esm({
  "src/shared/room-editor-context.js"() {
    init_shape_editor();
  }
});

// src/room-editor-app.js
var room_editor_app_exports = {};
__export(room_editor_app_exports, {
  DungeonForgeRoomEditorApp: () => DungeonForgeRoomEditorApp
});
var ApplicationV2, HandlebarsApplicationMixin, ROOM_EDITOR_GRID_SIZE, DungeonForgeRoomEditorApp;
var init_room_editor_app = __esm({
  "src/room-editor-app.js"() {
    init_shape_editor();
    init_room_editor_context();
    ({ ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api);
    ROOM_EDITOR_GRID_SIZE = 24;
    DungeonForgeRoomEditorApp = class _DungeonForgeRoomEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
      static DEFAULT_OPTIONS = {
        id: "dungeon-forge-room-editor",
        window: { title: "Editar Salas", resizable: true },
        position: { width: 640, height: 520 },
        actions: {
          selectRoom: _DungeonForgeRoomEditorApp.#onSelectRoom,
          resizeW: _DungeonForgeRoomEditorApp.#onResizeW,
          resizeH: _DungeonForgeRoomEditorApp.#onResizeH
        }
      };
      static PARTS = {
        roomList: { template: "modules/dungeon-forge/templates/room-editor-list.hbs" },
        detail: { template: "modules/dungeon-forge/templates/room-editor-detail.hbs" }
      };
      constructor({ dungeon, onClose, ...options }) {
        super(options);
        this.dungeon = dungeon;
        this.onClose = onClose;
        this.selectedRoomId = dungeon.rooms[0]?.id ?? null;
      }
      #selectedRoom() {
        return this.dungeon.rooms.find((r) => r.id === this.selectedRoomId) ?? null;
      }
      async _prepareContext() {
        return {
          roomsByFloor: groupRoomsByFloor(this.dungeon.rooms, this.dungeon.areas, this.selectedRoomId),
          detail: buildDetailContext(this.#selectedRoom())
        };
      }
      async _onRender() {
        const room = this.#selectedRoom();
        if (!room) return;
        const typeSelect = this.element.querySelector("[data-shape-type-select]");
        if (typeSelect && !typeSelect.dataset.listenerBound) {
          typeSelect.dataset.listenerBound = "true";
          typeSelect.addEventListener("change", async (event) => {
            await this.#applyShapeTypeChange(room, event.target.value);
          });
        }
        const paramSelect = this.element.querySelector("[data-shape-param-select]");
        if (paramSelect && !paramSelect.dataset.listenerBound) {
          paramSelect.dataset.listenerBound = "true";
          paramSelect.addEventListener("change", async (event) => {
            applyShapeParam(room, event.target.value);
            await this.render();
          });
        }
        const interactive = (room.shape?.type ?? "rect") === "custom";
        const container = this.element.querySelector("[data-shape-editor]");
        if (container) {
          container.innerHTML = buildShapeEditorSVG(room, this.dungeon, ROOM_EDITOR_GRID_SIZE, interactive);
          if (interactive) {
            wireShapeEditorToggle(container, (x, y) => {
              applyCustomToggle(room, x, y);
              this.render();
            });
          }
        }
      }
      async #applyShapeTypeChange(room, nextType) {
        if (room.shape?.type === "custom" && nextType !== "custom") {
          if (!window.confirm("Isso descarta os ajustes manuais desta sala. Continuar?")) {
            await this.render();
            return;
          }
        }
        applyShapeType(room, nextType);
        await this.render();
      }
      async close(options) {
        this.onClose?.();
        return super.close(options);
      }
      static async #onSelectRoom(event, target) {
        this.selectedRoomId = Number(target.dataset.roomId);
        await this.render();
      }
      static async #onResizeW(event, target) {
        const room = this.dungeon.rooms.find((r) => r.id === this.selectedRoomId);
        if (!room) return;
        applySizeDelta(room, this.dungeon, "w", Number(target.dataset.delta));
        await this.render();
      }
      static async #onResizeH(event, target) {
        const room = this.dungeon.rooms.find((r) => r.id === this.selectedRoomId);
        if (!room) return;
        applySizeDelta(room, this.dungeon, "h", Number(target.dataset.delta));
        await this.render();
      }
    };
  }
});

// src/preview-app.js
var ApplicationV22, HandlebarsApplicationMixin2, DungeonForgePreviewApp;
var init_preview_app = __esm({
  "src/preview-app.js"() {
    init_pipeline();
    init_src();
    init_v13();
    init_config_form();
    ({ ApplicationV2: ApplicationV22, HandlebarsApplicationMixin: HandlebarsApplicationMixin2 } = foundry.applications.api);
    DungeonForgePreviewApp = class _DungeonForgePreviewApp extends HandlebarsApplicationMixin2(ApplicationV22) {
      static DEFAULT_OPTIONS = {
        id: "dungeon-forge-preview",
        window: { title: "Pr\xE9-visualizar Masmorra", resizable: true },
        position: { width: 560, height: 480 },
        actions: {
          reroll: _DungeonForgePreviewApp.#onReroll,
          back: _DungeonForgePreviewApp.#onBack,
          editRooms: _DungeonForgePreviewApp.#onEditRooms,
          create: _DungeonForgePreviewApp.#onCreate
        }
      };
      static PARTS = {
        body: { template: "modules/dungeon-forge/templates/preview.hbs" }
      };
      constructor({ dungeon, config, ...options }) {
        super(options);
        this.dungeon = dungeon;
        this.config = config;
        this.floor = 0;
        this.rerollCount = 0;
        this.imageUrl = null;
        this.renderToken = 0;
      }
      async _prepareContext() {
        const floorOptions = Array.from({ length: this.dungeon.floors }, (_, i) => ({
          value: i,
          label: `Andar ${i + 1}`,
          selected: i === this.floor
        }));
        return {
          seed: this.config.seed,
          showFloorSelector: this.dungeon.floors > 1,
          floorOptions,
          imageUrl: this.imageUrl
        };
      }
      async _onRender() {
        const token = ++this.renderToken;
        const { blob } = await renderFloor(this.dungeon, this.floor, this.config.gridSize);
        if (token === this.renderToken) {
          if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
          this.imageUrl = URL.createObjectURL(blob);
          const img = this.element.querySelector("[data-preview-image]");
          if (img) img.src = this.imageUrl;
        }
        const select = this.element.querySelector("[data-floor-select]");
        if (select && !select.dataset.listenerBound) {
          select.dataset.listenerBound = "true";
          select.addEventListener("change", async (event) => {
            this.floor = Number(event.target.value);
            await this.render();
          });
        }
      }
      async close(options) {
        if (this.imageUrl) {
          URL.revokeObjectURL(this.imageUrl);
          this.imageUrl = null;
        }
        return super.close(options);
      }
      static async #onReroll() {
        this.rerollCount += 1;
        this.config = { ...this.config, seed: nextRerollSeed(this.config.seed, this.rerollCount) };
        this.dungeon = generateDungeon(this.config);
        this.floor = 0;
        await this.render();
      }
      static async #onBack() {
        const { DungeonForgeConfigApp: DungeonForgeConfigApp2 } = await Promise.resolve().then(() => (init_config_app(), config_app_exports));
        await this.close();
        new DungeonForgeConfigApp2({ config: this.config }).render(true);
      }
      static async #onEditRooms() {
        const { DungeonForgeRoomEditorApp: DungeonForgeRoomEditorApp2 } = await Promise.resolve().then(() => (init_room_editor_app(), room_editor_app_exports));
        new DungeonForgeRoomEditorApp2({
          dungeon: this.dungeon,
          onClose: () => this.render()
        }).render(true);
      }
      static async #onCreate() {
        try {
          const result = await emitV13(this.dungeon, this.config);
          ui.notifications.info(`Dungeon Forge: criado "${result.journal.name}" com ${result.scenes.length} Scene(s).`);
          await this.close();
        } catch (error) {
          ui.notifications.error(`Dungeon Forge: falha ao criar a masmorra \u2014 ${error.message}`);
          console.error("Dungeon Forge: emitV13 failed", error);
        }
      }
    };
  }
});

// src/config-app.js
var config_app_exports = {};
__export(config_app_exports, {
  DungeonForgeConfigApp: () => DungeonForgeConfigApp
});
var ApplicationV23, HandlebarsApplicationMixin3, DungeonForgeConfigApp;
var init_config_app = __esm({
  "src/config-app.js"() {
    init_pipeline();
    init_config_form();
    init_preview_app();
    ({ ApplicationV2: ApplicationV23, HandlebarsApplicationMixin: HandlebarsApplicationMixin3 } = foundry.applications.api);
    DungeonForgeConfigApp = class _DungeonForgeConfigApp extends HandlebarsApplicationMixin3(ApplicationV23) {
      static DEFAULT_OPTIONS = {
        id: "dungeon-forge-config",
        tag: "form",
        window: { title: "Gerar Masmorra", resizable: true },
        position: { width: 520, height: 480 },
        form: { handler: _DungeonForgeConfigApp.#onSubmit, submitOnChange: false, closeOnSubmit: false }
      };
      static PARTS = {
        tabs: { template: "modules/dungeon-forge/templates/config-tabs.hbs" },
        general: { template: "modules/dungeon-forge/templates/config-general.hbs" },
        rooms: { template: "modules/dungeon-forge/templates/config-rooms.hbs" },
        corridors: { template: "modules/dungeon-forge/templates/config-corridors.hbs" },
        stairs: { template: "modules/dungeon-forge/templates/config-stairs.hbs" },
        key: { template: "modules/dungeon-forge/templates/config-key.hbs" },
        footer: { template: "modules/dungeon-forge/templates/config-footer.hbs" }
      };
      static TABS = {
        sheet: {
          tabs: [
            { id: "general", group: "sheet", label: "Geral" },
            { id: "rooms", group: "sheet", label: "Salas" },
            { id: "corridors", group: "sheet", label: "Corredores" },
            { id: "stairs", group: "sheet", label: "Escadas" },
            { id: "key", group: "sheet", label: "Chave" }
          ],
          initial: "general"
        }
      };
      constructor({ config, ...options } = {}) {
        super(options);
        this.config = config ?? DEFAULT_CONFIG;
      }
      async _prepareContext() {
        const activeTabId = this.tabGroups?.sheet ?? this.constructor.TABS.sheet.initial;
        const tabs = Object.fromEntries(
          this.constructor.TABS.sheet.tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return [tab.id, { ...tab, active, cssClass: active ? "active" : "" }];
          })
        );
        return {
          tabs,
          formData: formDataFromConfig(this.config),
          shapeWeightTypes: SHAPE_WEIGHT_TYPES
        };
      }
      static async #onSubmit(event, form, formData) {
        const config = configFromFormData(formData.object);
        const dungeon = generateDungeon(config);
        await this.close();
        new DungeonForgePreviewApp({ dungeon, config }).render(true);
      }
    };
  }
});

// src/index.js
init_pipeline();
init_v13();
async function generate(config) {
  if (config.target !== "v13") {
    throw new Error(`adapter-foundry: unsupported target "${config.target}" (only 'v13' implemented)`);
  }
  const dungeon = generateDungeon(config);
  return emitV13(dungeon, config);
}
if (typeof Hooks !== "undefined") {
  Hooks.once("init", async () => {
    game.modules.get("dungeon-forge").api = { generate };
    const { DungeonForgeConfigApp: DungeonForgeConfigApp2 } = await Promise.resolve().then(() => (init_config_app(), config_app_exports));
    game.settings.registerMenu("dungeon-forge", "generate", {
      name: "Gerar Masmorra",
      label: "Abrir",
      icon: "fas fa-dungeon",
      type: DungeonForgeConfigApp2,
      restricted: true
    });
  });
}
export {
  generate
};
