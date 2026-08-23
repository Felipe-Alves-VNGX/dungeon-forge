// harness/src/main.js
import { generateDungeon, keyToMarkdown } from '@dungeon-forge/core';
import { renderFloor } from '@dungeon-forge/render';

const DEFAULT_CONFIG = {
  floors: 1,
  width: 50,
  height: 50,
  rooms: { count: 9, sizeMean: 7, sizeStdDev: 2.5, sizeMin: 3, sizeMax: 14, spawnRadius: 18, separationIters: 60 },
  cycleRate: 0.25,
  verticalLinksPerGap: 2,
  carve: { newHallway: 10, reuseHallway: 1, throughRoom: 50, turn: 2 },
  pruneIterations: 8,
  key: { scheme: 'per-floor', numberJunctions: false, startAt: 1, padTo: 2, exitsInEntries: true },
};

const seedInput = document.getElementById('seed');
const generateButton = document.getElementById('generate');
const floorImage = document.getElementById('floor-image');
const keyMarkdown = document.getElementById('key-markdown');

async function generate() {
  const seed = seedInput.value || 'preview-seed';
  const dungeon = generateDungeon({ ...DEFAULT_CONFIG, seed });
  const { blob } = await renderFloor(dungeon, 0, 100);
  floorImage.src = URL.createObjectURL(blob);
  keyMarkdown.textContent = keyToMarkdown(dungeon.areas, dungeon.key);
}

generateButton.addEventListener('click', generate);
generate();
