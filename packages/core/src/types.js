// packages/core/src/types.js
//
// Pure JSDoc typedefs — the data contract between pipeline stages.
// Copied from SPEC.md §4. No runtime code lives here.

/**
 * @typedef {Object} Config
 * @property {string} seed
 * @property {number} floors
 * @property {number} width
 * @property {number} height
 * @property {RoomParams} rooms
 * @property {number} cycleRate
 * @property {number} verticalLinksPerGap
 * @property {CarveCosts} carve
 * @property {number} pruneIterations
 * @property {KeyConfig} key
 */

/**
 * @typedef {Object} KeyConfig
 * @property {'flat'|'per-floor'|'alpha-floor'} scheme
 * @property {boolean} numberJunctions
 * @property {number} startAt
 * @property {number} padTo
 * @property {boolean} exitsInEntries
 */

/**
 * @typedef {Object} RoomParams
 * @property {number} count
 * @property {number} sizeMean
 * @property {number} sizeStdDev
 * @property {number} sizeMin
 * @property {number} sizeMax
 * @property {number} spawnRadius
 * @property {number} separationIters
 */

/**
 * @typedef {Object} CarveCosts
 * @property {number} newHallway
 * @property {number} reuseHallway
 * @property {number} throughRoom
 * @property {number} turn
 */

/**
 * @typedef {Object} Room
 * @property {number} id
 * @property {number} floor
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} cx
 * @property {number} cy
 * @property {RoomRole} role
 * @property {number[]} doors
 */

/** @typedef {'entrance'|'climax'|'treasure'|'junction'|'filler'} RoomRole */

/**
 * @typedef {Object} Edge
 * @property {number} a
 * @property {number} b
 * @property {number} weight
 * @property {'mst'|'cycle'|'vertical'} kind
 */

/**
 * @typedef {Object} VerticalLink
 * @property {number} id
 * @property {number} fromFloor
 * @property {number} toFloor
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {'stair'|'shaft'|'ladder'} kind
 * @property {number} roomIdFrom     // nearest Room on fromFloor — not in SPEC.md's
 * @property {number} roomIdTo       // minimal typedef, added so carve/mission/key can
 *                                   // each resolve "which room, which link" without
 *                                   // re-deriving nearest-room or coupling parallel arrays
 */

/**
 * @typedef {Object} Door
 * @property {number} id
 * @property {number} floor
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {number} roomId
 * @property {boolean} secret
 */

/**
 * @typedef {Object} Area
 * @property {number} id
 * @property {string} label
 * @property {number} floor
 * @property {number|null} roomId
 * @property {number} cx
 * @property {number} cy
 * @property {AreaExit[]} exits
 */

/**
 * @typedef {Object} AreaExit
 * @property {'n'|'s'|'e'|'w'|'up'|'down'} dir
 * @property {string} toLabel
 * @property {'door'|'secret'|'open'|'stair'|'shaft'} via
 */

/**
 * @typedef {Object} KeyEntry
 * @property {number} areaId
 * @property {string} label
 * @property {string} title
 * @property {string} description
 * @property {string[]} tags
 */

/**
 * @typedef {Object} LegendSymbol
 * @property {'entrance'|'climax'|'treasure'|'junction'|'area'|'stairUp'|'stairDown'|'secret'} kind
 * @property {string} caption
 */

/**
 * @typedef {Object} WallSegment
 * @property {number} floor
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {boolean} isDoor
 * @property {number|null} doorId
 */

/**
 * @typedef {Object} Issue
 * @property {number} rule        // 1-15, SPEC.md §6 invariant number
 * @property {string} message     // human-readable, includes enough context to locate the problem
 * @property {number} [floor]
 */

/**
 * @typedef {Object} Dungeon
 * @property {Config} config
 * @property {string} seed
 * @property {number} width
 * @property {number} height
 * @property {number} floors
 * @property {Uint8Array} cells
 * @property {Room[]} rooms
 * @property {Edge[]} edges
 * @property {VerticalLink[]} links
 * @property {Door[]} doors
 * @property {WallSegment[]} walls
 * @property {Object} mission
 * @property {Area[]} areas
 * @property {Object} key
 */

export {};
