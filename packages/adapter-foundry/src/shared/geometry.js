// packages/adapter-foundry/src/shared/geometry.js
//
// Pure translation from dungeon-forge's cell-unit data to Foundry's
// pixel-unit document-creation data. No Foundry globals used here — every
// numeric constant below is hardcoded to the value confirmed live against
// Foundry v13.351 (see docs/superpowers/specs/2026-09-02-adapter-foundry-v13-design.md),
// specifically so this file stays importable and testable in plain Node.
//
// Notes/Regions/Walls read wall.isDoor + doorsById.get(wall.doorId)?.secret
// directly from Dungeon.walls/Dungeon.doors — NOT from
// @dungeon-forge/render's buildRenderPlan, whose isDoor flag intentionally
// masks secret doors for the baked floor-plan image. Foundry's own
// wall/vision system is what should hide a secret door from players here.

import { iconForRole } from './icons.js';

const WALL_SENSE_NORMAL = 20; // CONST.WALL_SENSE_TYPES.NORMAL
const WALL_DOOR_NONE = 0;     // CONST.WALL_DOOR_TYPES.NONE
const WALL_DOOR_DOOR = 1;     // CONST.WALL_DOOR_TYPES.DOOR
const WALL_DOOR_SECRET = 2;   // CONST.WALL_DOOR_TYPES.SECRET
const WALL_DOOR_STATE_CLOSED = 0; // CONST.WALL_DOOR_STATES.CLOSED
const WALL_DIR_BOTH = 0;      // CONST.WALL_DIRECTIONS.BOTH
const TEXT_ANCHOR_CENTER = 0; // CONST.TEXT_ANCHOR_POINTS.CENTER

const NOTE_FONT_SIZE = 32;      // SPEC.md §5.14: "derivado de gridSize, mínimo 24" — 32 covers gridSize=100 default
const NOTE_ICON_SCALE = 0.6;    // SPEC.md §5.14: iconSize = gridSize * 0.6

export function toPixel(cell, gridSize) {
  return cell * gridSize;
}

export function buildWallData(wall, doorsById, gridSize) {
  const door = !wall.isDoor
    ? WALL_DOOR_NONE
    : (doorsById.get(wall.doorId)?.secret ? WALL_DOOR_SECRET : WALL_DOOR_DOOR);

  return {
    c: [
      toPixel(wall.x1, gridSize),
      toPixel(wall.y1, gridSize),
      toPixel(wall.x2, gridSize),
      toPixel(wall.y2, gridSize),
    ],
    light: WALL_SENSE_NORMAL,
    move: WALL_SENSE_NORMAL,
    sight: WALL_SENSE_NORMAL,
    sound: WALL_SENSE_NORMAL,
    dir: WALL_DIR_BOTH,
    door,
    ds: WALL_DOOR_STATE_CLOSED,
  };
}

export function buildNoteData(area, gridSize, pageId, journalId, role) {
  return {
    entryId: journalId,
    pageId,
    x: toPixel(area.cx, gridSize),
    y: toPixel(area.cy, gridSize),
    text: area.label,
    fontSize: NOTE_FONT_SIZE,
    textAnchor: TEXT_ANCHOR_CENTER,
    texture: { src: iconForRole(role) },
    iconSize: Math.round(gridSize * NOTE_ICON_SCALE),
  };
}
